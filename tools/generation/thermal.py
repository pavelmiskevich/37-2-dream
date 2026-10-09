"""Overheat protection for local generation (docs/generation-plan.md).

Every model run goes through ThermalGuard:

- sensor: Windows counter ``\\Thermal Zone Information(*)\\Temperature``
  (laptop, kelvin, readable without admin rights) or ``nvidia-smi`` (desktop);
  no sensor -> the script refuses to start;
- pause at ``pause_at`` and above until the temperature drops to ``resume_at``;
- emergency stop at ``abort_at`` and above, also in the middle of a frame
  (watchdog thread);
- duty cycle: after each frame rest at least ``duty`` x its generation time;
- batches of ``batch_size`` frames with a ``batch_break`` rest between them;
- mains power only, one generator at a time (lock file);
- CSV log of every frame: time, temperature before / peak / after, duration.

Only the standard library is used here, so the guard and its tests run with any
Python 3.12 without the generation environment.
"""

from __future__ import annotations

import argparse
import csv
import ctypes
import dataclasses
import datetime as dt
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Iterator, Protocol, TypeVar

HERE = Path(__file__).resolve().parent
DEFAULT_LOG_DIR = HERE / "logs"
DEFAULT_LOCK = HERE / ".generate.lock"

KELVIN_OFFSET = 273.15
# Readings outside this range are treated as a broken sensor, not as a value.
PLAUSIBLE_C = (5.0, 130.0)

EXIT_REFUSED = 2
EXIT_THERMAL_ABORT = 3

T = TypeVar("T")


class GuardRefused(RuntimeError):
    """The guard refuses to start: no sensor, on battery, another generator running."""


class ThermalAbort(RuntimeError):
    """Emergency stop: too hot, sensor lost, power lost or no cooling."""


class SensorError(RuntimeError):
    """The sensor could not be read."""


# --------------------------------------------------------------------------
# Sensors


class Sensor(Protocol):
    name: str

    def read(self) -> float:
        """Current temperature in degrees Celsius; raises SensorError."""
        ...


def _run(cmd: list[str], timeout: float) -> str:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=flags,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SensorError(f"{cmd[0]}: {exc}") from exc
    if proc.returncode != 0:
        raise SensorError(f"{cmd[0]} exited with {proc.returncode}: {proc.stdout.strip()} {proc.stderr.strip()}")
    return proc.stdout


def _check_plausible(value_c: float, source: str) -> float:
    lo, hi = PLAUSIBLE_C
    if not lo <= value_c <= hi:
        raise SensorError(f"{source}: implausible temperature {value_c:.1f} C")
    return value_c


def parse_typeperf(text: str) -> list[float]:
    """Values of the first data row of ``typeperf -sc 1`` CSV output."""
    rows = list(csv.reader(line for line in text.splitlines() if line.startswith('"')))
    if len(rows) < 2:
        raise SensorError("typeperf: no data rows")
    values: list[float] = []
    for cell in rows[1][1:]:
        cell = cell.strip()
        if not cell:
            continue
        try:
            values.append(float(cell))
        except ValueError as exc:
            raise SensorError(f"typeperf: bad value {cell!r}") from exc
    if not values:
        raise SensorError("typeperf: empty sample")
    return values


class WindowsThermalZoneSensor:
    """Hottest ACPI thermal zone via Windows performance counters.

    ``High Precision Temperature`` is in tenths of a kelvin, ``Temperature`` in
    whole kelvins; the first one is tried first. Both read without admin rights.
    """

    name = "windows-thermal-zone"
    COUNTERS = (
        (r"\Thermal Zone Information(*)\High Precision Temperature", 10.0),
        (r"\Thermal Zone Information(*)\Temperature", 1.0),
    )

    def __init__(self, timeout: float = 20.0) -> None:
        self.timeout = timeout

    def read(self) -> float:
        if shutil.which("typeperf") is None:
            raise SensorError("typeperf not found (Windows only)")
        errors = []
        for counter, divisor in self.COUNTERS:
            try:
                raw = parse_typeperf(_run(["typeperf", counter, "-sc", "1"], self.timeout))
            except SensorError as exc:
                errors.append(str(exc))
                continue
            return _check_plausible(max(raw) / divisor - KELVIN_OFFSET, self.name)
        raise SensorError("; ".join(errors))


def parse_nvidia_smi(text: str) -> list[float]:
    values = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            values.append(float(line))
        except ValueError as exc:
            raise SensorError(f"nvidia-smi: bad value {line!r}") from exc
    if not values:
        raise SensorError("nvidia-smi: no GPUs reported")
    return values


class NvidiaSmiSensor:
    """Hottest NVIDIA GPU via ``nvidia-smi`` (desktop profile)."""

    name = "nvidia-smi"

    def __init__(self, timeout: float = 20.0) -> None:
        self.timeout = timeout

    def read(self) -> float:
        if shutil.which("nvidia-smi") is None:
            raise SensorError("nvidia-smi not found")
        out = _run(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            self.timeout,
        )
        return _check_plausible(max(parse_nvidia_smi(out)), self.name)


# --------------------------------------------------------------------------
# Power


POWER_AC = "ac"
POWER_BATTERY = "battery"
POWER_NO_BATTERY = "no-battery"  # desktop without a system battery
POWER_UNKNOWN = "unknown"


def power_status() -> str:
    """Mains power state via ``GetSystemPowerStatus`` (Windows)."""
    if sys.platform != "win32":
        return POWER_UNKNOWN

    class SystemPowerStatus(ctypes.Structure):
        _fields_ = [
            ("ACLineStatus", ctypes.c_ubyte),
            ("BatteryFlag", ctypes.c_ubyte),
            ("BatteryLifePercent", ctypes.c_ubyte),
            ("SystemStatusFlag", ctypes.c_ubyte),
            ("BatteryLifeTime", ctypes.c_ulong),
            ("BatteryFullLifeTime", ctypes.c_ulong),
        ]

    status = SystemPowerStatus()
    if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)):  # type: ignore[attr-defined]
        return POWER_UNKNOWN
    if status.BatteryFlag == 128:
        return POWER_NO_BATTERY
    if status.ACLineStatus == 1:
        return POWER_AC
    if status.ACLineStatus == 0:
        return POWER_BATTERY
    return POWER_UNKNOWN


# --------------------------------------------------------------------------
# Lock file


class FileLock:
    """Exclusive OS-level lock; released by the OS even if the process dies."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._fd: int | None = None

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            if sys.platform == "win32":
                import msvcrt

                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            os.close(fd)
            raise GuardRefused(
                f"another generator is already running (lock file {self.path})"
            ) from exc
        self._fd = fd

    def release(self) -> None:
        if self._fd is None:
            return
        fd, self._fd = self._fd, None
        try:
            if sys.platform == "win32":
                import msvcrt

                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)

    def __enter__(self) -> "FileLock":
        self.acquire()
        return self

    def __exit__(self, *exc: object) -> None:
        self.release()


# --------------------------------------------------------------------------
# Limits and profiles


@dataclasses.dataclass(frozen=True)
class ThermalLimits:
    pause_at: float = 85.0
    """Pause before the next frame at this temperature and above, C."""
    resume_at: float = 70.0
    """A pause lasts until the temperature drops to this value, C."""
    abort_at: float = 90.0
    """Emergency stop at this temperature and above, C (also mid-frame)."""
    duty: float = 1.0
    """Rest after a frame = duty x frame generation time."""
    min_rest: float = 0.0
    """Rest after a frame is never shorter than this, seconds."""
    batch_size: int = 10
    """Frames in a row before a long break; 0 = no batches."""
    batch_break: float = 600.0
    """Break between batches, seconds."""
    poll_interval: float = 5.0
    """How often the temperature is read while waiting or generating, seconds."""
    max_pause: float = 1800.0
    """Give up (emergency stop) if a pause has not cooled the device by then, seconds."""
    require_ac: bool = True
    """Refuse to run unless on mains power."""
    kill_grace: float = 60.0
    """After an emergency stop mid-frame, kill the process if the frame has not
    stopped within this many seconds."""

    def validate(self) -> None:
        if not self.resume_at < self.pause_at:
            raise ValueError("resume_at must be below pause_at (hysteresis)")
        if not self.pause_at <= self.abort_at:
            raise ValueError("pause_at must not exceed abort_at")
        for name in ("duty", "min_rest", "batch_break", "max_pause", "kill_grace"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be >= 0")
        if self.batch_size < 0:
            raise ValueError("batch_size must be >= 0")
        if self.poll_interval <= 0:
            raise ValueError("poll_interval must be > 0")


@dataclasses.dataclass(frozen=True)
class Profile:
    name: str
    sensor: Callable[[], Sensor]
    limits: ThermalLimits
    default_device: str
    source: str
    """``generation.source`` written to the library manifest."""


PROFILES: dict[str, Profile] = {
    "laptop": Profile(
        name="laptop",
        sensor=WindowsThermalZoneSensor,
        limits=ThermalLimits(),
        default_device="xpu",
        source="local-laptop",
    ),
    "desktop": Profile(
        name="desktop",
        sensor=NvidiaSmiSensor,
        # Desktop cooling is built for sustained load: no forced rest or
        # batches, but the GPU must stay below 83 C (docs/generation-plan.md).
        limits=ThermalLimits(
            pause_at=80.0,
            resume_at=70.0,
            abort_at=83.0,
            duty=0.0,
            batch_size=0,
            batch_break=0.0,
            require_ac=False,
        ),
        default_device="cuda",
        source="local-desktop",
    ),
}


# --------------------------------------------------------------------------
# Log


LOG_FIELDS = (
    "time",
    "event",
    "frame",
    "temp_c",
    "temp_before_c",
    "temp_peak_c",
    "temp_after_c",
    "seconds",
    "note",
)


class ThermalLog:
    """Append-only CSV log; one row per frame and per pause / break / stop."""

    def __init__(self, path: Path | None, echo: Callable[[str], None] | None = print) -> None:
        self.path = Path(path) if path else None
        self.echo = echo
        self.rows: list[dict[str, str]] = []

    def write(self, event: str, **fields: object) -> None:
        row = {key: "" for key in LOG_FIELDS}
        row["time"] = dt.datetime.now().isoformat(timespec="seconds")
        row["event"] = event
        for key, value in fields.items():
            if key not in row:
                raise KeyError(key)
            row[key] = f"{value:.1f}" if isinstance(value, float) else str(value)
        self.rows.append(row)
        if self.echo:
            parts = [f"{k}={v}" for k, v in row.items() if v and k not in ("time", "event")]
            self.echo(f"[thermal] {row['time']} {event} " + " ".join(parts))
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            new = not self.path.exists() or self.path.stat().st_size == 0
            with self.path.open("a", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=LOG_FIELDS)
                if new:
                    writer.writeheader()
                writer.writerow(row)


# --------------------------------------------------------------------------
# Watchdog (mid-frame emergency stop)


class Watchdog:
    """Polls the sensor in a background thread while a frame is generated.

    At ``abort_at`` (or when the sensor is lost) it trips: the generation loop
    sees it through ``check()`` (called from a diffusion step callback) and
    raises ThermalAbort. If the frame still has not stopped ``kill_grace``
    seconds later, ``kill`` is called (the real one terminates the process).
    """

    def __init__(
        self,
        sensor: Sensor,
        limits: ThermalLimits,
        kill: Callable[[str], None] | None = None,
        max_sensor_failures: int = 3,
    ) -> None:
        self.sensor = sensor
        self.limits = limits
        self.kill = kill or _hard_kill
        self.max_sensor_failures = max_sensor_failures
        self.peak: float | None = None
        self.reason: str | None = None
        self._tripped = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="thermal-watchdog", daemon=True)

    @property
    def tripped(self) -> bool:
        return self._tripped.is_set()

    def start(self) -> "Watchdog":
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=self.limits.poll_interval + 30)

    def check(self) -> None:
        """Raise ThermalAbort if tripped; call this between diffusion steps."""
        if self.tripped:
            raise ThermalAbort(self.reason or "watchdog tripped")

    def note(self, value: float) -> None:
        self.peak = value if self.peak is None else max(self.peak, value)

    def _trip(self, reason: str) -> None:
        self.reason = reason
        self._tripped.set()
        print(f"[thermal] EMERGENCY STOP: {reason}", file=sys.stderr, flush=True)
        if not self._stop.wait(self.limits.kill_grace):
            self.kill(reason)

    def _loop(self) -> None:
        failures = 0
        while not self._stop.wait(self.limits.poll_interval):
            try:
                value = self.sensor.read()
            except SensorError as exc:
                failures += 1
                if failures >= self.max_sensor_failures:
                    self._trip(f"sensor lost during frame: {exc}")
                    return
                continue
            failures = 0
            self.note(value)
            if value >= self.limits.abort_at:
                self._trip(f"{value:.1f} C >= {self.limits.abort_at:.1f} C during frame")
                return


def _hard_kill(reason: str) -> None:
    print(
        f"[thermal] frame did not stop after emergency stop ({reason}); terminating process",
        file=sys.stderr,
        flush=True,
    )
    os._exit(EXIT_THERMAL_ABORT)


# --------------------------------------------------------------------------
# Guard


class ThermalGuard:
    """Wraps every frame: cool enough before, watched during, rest after."""

    def __init__(
        self,
        sensor: Sensor,
        limits: ThermalLimits,
        log: ThermalLog | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        power: Callable[[], str] = power_status,
        watchdog_factory: Callable[[Sensor, ThermalLimits], Watchdog] | None = None,
    ) -> None:
        limits.validate()
        self.sensor = sensor
        self.limits = limits
        self.log = log or ThermalLog(None, echo=None)
        self.clock = clock
        self.sleep = sleep
        self.power = power
        self.watchdog_factory = watchdog_factory or (lambda s, lim: Watchdog(s, lim))
        self.frames_in_batch = 0
        self.frames_total = 0
        self.started = False

    # -- checks

    def check_power(self) -> None:
        state = self.power()
        if state == POWER_BATTERY:
            raise GuardRefused("running on battery; connect the charger")
        if state == POWER_UNKNOWN and self.limits.require_ac:
            raise GuardRefused("cannot confirm mains power; refusing to run")

    def read(self) -> float:
        """Read the sensor; losing it after start is an emergency stop."""
        try:
            return self.sensor.read()
        except SensorError as exc:
            if not self.started:
                raise GuardRefused(f"temperature sensor unavailable: {exc}") from exc
            self.log.write("abort", note=f"sensor lost: {exc}")
            raise ThermalAbort(f"temperature sensor lost: {exc}") from exc

    def _abort_if_hot(self, value: float, where: str) -> None:
        if value >= self.limits.abort_at:
            self.log.write("abort", temp_c=value, note=where)
            raise ThermalAbort(f"{value:.1f} C >= {self.limits.abort_at:.1f} C ({where})")

    def start(self) -> float:
        """Refuse to run without mains power or a sensor; return the temperature."""
        self.check_power()
        value = self.read()
        self.started = True
        self.log.write("start", temp_c=value, note=self.sensor.name)
        self._abort_if_hot(value, "at start")
        return value

    # -- waiting

    def rest(self, seconds: float, reason: str) -> float | None:
        """Sleep ``seconds`` in poll-sized chunks, watching the temperature."""
        deadline = self.clock() + seconds
        last = None
        while True:
            left = deadline - self.clock()
            if left <= 0:
                return last
            self.sleep(min(self.limits.poll_interval, left))
            last = self.read()
            self._abort_if_hot(last, reason)

    def wait_until_cool(self) -> float:
        """Return the temperature once it is below ``pause_at``.

        At ``pause_at`` and above, wait until it drops to ``resume_at``
        (hysteresis); at ``abort_at`` or after ``max_pause``, stop.
        """
        value = self.read()
        self._abort_if_hot(value, "before frame")
        if value < self.limits.pause_at:
            return value
        started = self.clock()
        self.log.write("pause", temp_c=value, note=f">= {self.limits.pause_at:.1f} C, waiting for {self.limits.resume_at:.1f} C")
        while value > self.limits.resume_at:
            if self.clock() - started >= self.limits.max_pause:
                self.log.write("abort", temp_c=value, seconds=self.clock() - started, note="did not cool down")
                raise ThermalAbort(
                    f"still {value:.1f} C after {self.limits.max_pause:.0f} s pause; check ventilation"
                )
            self.sleep(self.limits.poll_interval)
            value = self.read()
            self._abort_if_hot(value, "during pause")
        self.log.write("resume", temp_c=value, seconds=self.clock() - started)
        return value

    # -- frames

    def before_frame(self) -> float:
        if not self.started:
            self.start()
        self.check_power_mid_run()
        if self.limits.batch_size and self.frames_in_batch >= self.limits.batch_size:
            self.log.write("batch_break", seconds=self.limits.batch_break, note=f"after {self.frames_in_batch} frames")
            self.rest(self.limits.batch_break, "batch break")
            self.frames_in_batch = 0
        return self.wait_until_cool()

    def check_power_mid_run(self) -> None:
        try:
            self.check_power()
        except GuardRefused as exc:
            self.log.write("abort", note=str(exc))
            raise ThermalAbort(str(exc)) from exc

    def rest_seconds(self, generation_seconds: float) -> float:
        return max(self.limits.min_rest, self.limits.duty * generation_seconds)

    def run(self, frame_id: str, generate: Callable[[Watchdog], T], *, counts: bool = True) -> T:
        """Generate one frame under protection.

        ``generate`` receives the watchdog and must call ``watchdog.check()``
        between diffusion steps. ``counts=False`` is for other model work (for
        example prompt encoding): it gets the same protection and rest but is
        not counted as a frame of the batch.
        """
        before = self.before_frame()
        watchdog = self.watchdog_factory(self.sensor, self.limits)
        watchdog.note(before)
        watchdog.start()
        started = self.clock()
        try:
            result = generate(watchdog)
            watchdog.check()
        except ThermalAbort as exc:
            self.log.write(
                "abort",
                frame=frame_id,
                temp_before_c=before,
                temp_peak_c=watchdog.peak if watchdog.peak is not None else "",
                seconds=self.clock() - started,
                note=str(exc),
            )
            raise
        finally:
            watchdog.stop()
        seconds = self.clock() - started
        after = self.read()
        watchdog.note(after)
        if counts:
            self.frames_in_batch += 1
            self.frames_total += 1
        self.log.write(
            "frame" if counts else "work",
            frame=frame_id,
            temp_before_c=before,
            temp_peak_c=watchdog.peak if watchdog.peak is not None else after,
            temp_after_c=after,
            seconds=seconds,
        )
        self._abort_if_hot(after, f"after frame {frame_id}")
        rest = self.rest_seconds(seconds)
        if rest > 0:
            self.log.write("rest", frame=frame_id, seconds=rest)
            self.rest(rest, "rest after frame")
        return result


# --------------------------------------------------------------------------
# CLI helpers shared with generate.py


def add_guard_arguments(parser: argparse.ArgumentParser) -> None:
    group = parser.add_argument_group("overheat protection (defaults come from --profile)")
    group.add_argument("--profile", choices=sorted(PROFILES), default="laptop")
    group.add_argument("--pause-at", type=float, help="pause at this temperature, C (laptop 85)")
    group.add_argument("--resume-at", type=float, help="resume after cooling to this, C (laptop 70)")
    group.add_argument("--abort-at", type=float, help="emergency stop at this, C (laptop 90, desktop 83)")
    group.add_argument("--duty", type=float, help="rest after a frame = duty x its time (laptop 1.0)")
    group.add_argument("--min-rest", type=float, help="minimum rest after a frame, s")
    group.add_argument("--batch-size", type=int, help="frames per batch, 0 = no batches (laptop 10)")
    group.add_argument("--batch-break", type=float, help="break between batches, s (laptop 600)")
    group.add_argument("--poll-interval", type=float, help="sensor poll interval, s (5)")
    group.add_argument("--max-pause", type=float, help="stop if a pause lasts longer, s (1800)")
    group.add_argument("--log", type=Path, help="CSV log (default tools/generation/logs/thermal-<profile>.csv)")
    group.add_argument("--lock", type=Path, default=DEFAULT_LOCK, help="lock file")


def limits_from_args(args: argparse.Namespace) -> ThermalLimits:
    base = PROFILES[args.profile].limits
    overrides = {}
    for field in ("pause_at", "resume_at", "abort_at", "duty", "min_rest", "batch_size", "batch_break", "poll_interval", "max_pause"):
        value = getattr(args, field, None)
        if value is not None:
            overrides[field] = value
    limits = dataclasses.replace(base, **overrides)
    limits.validate()
    return limits


def log_path_from_args(args: argparse.Namespace) -> Path:
    return args.log or DEFAULT_LOG_DIR / f"thermal-{args.profile}.csv"


def describe(limits: ThermalLimits) -> str:
    batches = (
        f"batches of {limits.batch_size} with {limits.batch_break:.0f} s break"
        if limits.batch_size
        else "no batches"
    )
    return (
        f"pause >= {limits.pause_at:.1f} C until <= {limits.resume_at:.1f} C, "
        f"stop >= {limits.abort_at:.1f} C, rest {limits.duty:g} x frame time "
        f"(min {limits.min_rest:.0f} s), {batches}, mains power "
        f"{'required' if limits.require_ac else 'not required'}"
    )


def iter_samples(sensor: Sensor, count: int, interval: float) -> Iterator[float]:
    for i in range(count):
        if i:
            time.sleep(interval)
        yield sensor.read()


def _cmd_check(args: argparse.Namespace) -> int:
    profile = PROFILES[args.profile]
    limits = limits_from_args(args)
    print(f"profile: {profile.name}; {describe(limits)}")
    print(f"power: {power_status()}")
    sensor = profile.sensor()
    ok = True
    try:
        for value in iter_samples(sensor, args.samples, args.interval):
            print(f"{dt.datetime.now().isoformat(timespec='seconds')} {sensor.name}: {value:.1f} C")
    except SensorError as exc:
        print(f"sensor: UNAVAILABLE ({exc})")
        ok = False
    try:
        with FileLock(args.lock):
            print(f"lock: free ({args.lock})")
    except GuardRefused as exc:
        print(f"lock: {exc}")
        ok = False
    guard = ThermalGuard(sensor, limits)
    try:
        guard.check_power()
    except GuardRefused as exc:
        print(f"power: REFUSED ({exc})")
        ok = False
    print("ready" if ok else "NOT READY")
    return 0 if ok else EXIT_REFUSED


def _cmd_simulate(args: argparse.Namespace) -> int:
    """Run dummy frames (plain sleep, no load) through the full guard."""
    profile = PROFILES[args.profile]
    limits = limits_from_args(args)
    log = ThermalLog(log_path_from_args(args))
    print(f"simulate {args.frames} dummy frames of {args.frame_seconds:g} s; {describe(limits)}")
    try:
        with FileLock(args.lock):
            guard = ThermalGuard(profile.sensor(), limits, log)
            guard.start()
            for i in range(args.frames):

                def frame(watchdog: Watchdog) -> None:
                    end = time.monotonic() + args.frame_seconds
                    while time.monotonic() < end:
                        watchdog.check()
                        time.sleep(min(0.5, max(0.0, end - time.monotonic())))

                guard.run(f"dummy-{i + 1}", frame)
    except GuardRefused as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_REFUSED
    except ThermalAbort as exc:
        print(f"emergency stop: {exc}", file=sys.stderr)
        return EXIT_THERMAL_ABORT
    print("simulation finished")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="read the sensor, power and lock; no load")
    add_guard_arguments(check)
    check.add_argument("--samples", type=int, default=1)
    check.add_argument("--interval", type=float, default=5.0)
    check.set_defaults(func=_cmd_check)

    sim = sub.add_parser("simulate", help="dummy frames through the guard (test thresholds without a model)")
    add_guard_arguments(sim)
    sim.add_argument("--frames", type=int, default=2)
    sim.add_argument("--frame-seconds", type=float, default=10.0)
    sim.set_defaults(func=_cmd_simulate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ValueError as exc:
        parser.error(str(exc))
        return EXIT_REFUSED


if __name__ == "__main__":
    sys.exit(main())
