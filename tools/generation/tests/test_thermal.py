"""Unit tests of the overheat protection logic, without a real sensor."""

from __future__ import annotations

import csv
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import thermal  # noqa: E402
from thermal import (  # noqa: E402
    POWER_AC,
    POWER_BATTERY,
    POWER_NO_BATTERY,
    POWER_UNKNOWN,
    FileLock,
    GuardRefused,
    SensorError,
    ThermalAbort,
    ThermalGuard,
    ThermalLimits,
    ThermalLog,
    Watchdog,
)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


class ScriptedSensor:
    """Returns readings from a list (last one repeats) or from f(clock)."""

    name = "fake"

    def __init__(self, readings=None, fn=None, clock: FakeClock | None = None) -> None:
        self.readings = list(readings or [])
        self.fn = fn
        self.clock = clock
        self.calls = 0

    def read(self) -> float:
        self.calls += 1
        if self.fn is not None:
            value = self.fn(self.clock.now if self.clock else self.calls)
        elif len(self.readings) > 1:
            value = self.readings.pop(0)
        else:
            value = self.readings[0]
        if isinstance(value, Exception):
            raise value
        return value


class NullWatchdog:
    """Watchdog stand-in without a thread."""

    def __init__(self, sensor, limits) -> None:
        self.peak = None
        self.tripped = False
        self.reason = None

    def note(self, value: float) -> None:
        self.peak = value if self.peak is None else max(self.peak, value)

    def start(self):
        return self

    def stop(self) -> None:
        pass

    def check(self) -> None:
        if self.tripped:
            raise ThermalAbort(self.reason or "tripped")


def make_guard(sensor, limits=None, power=POWER_AC, clock=None):
    clock = clock or FakeClock()
    if isinstance(sensor, ScriptedSensor) and sensor.clock is None:
        sensor.clock = clock
    log = ThermalLog(None, echo=None)
    guard = ThermalGuard(
        sensor,
        limits or ThermalLimits(),
        log,
        clock=clock,
        sleep=clock.sleep,
        power=lambda: power,
        watchdog_factory=NullWatchdog,
    )
    return guard, clock, log


def frame_taking(clock: FakeClock, seconds: float):
    def generate(watchdog):
        clock.now += seconds
        return "image"

    return generate


def events(log: ThermalLog) -> list[str]:
    return [row["event"] for row in log.rows]


class LimitsTest(unittest.TestCase):
    def test_defaults_match_generation_plan(self) -> None:
        limits = thermal.PROFILES["laptop"].limits
        self.assertEqual(
            (limits.pause_at, limits.resume_at, limits.abort_at), (85.0, 70.0, 90.0)
        )
        self.assertEqual(limits.duty, 1.0)
        self.assertEqual((limits.batch_size, limits.batch_break), (10, 600.0))
        self.assertTrue(limits.require_ac)
        self.assertEqual(thermal.PROFILES["desktop"].limits.abort_at, 83.0)

    def test_hysteresis_must_be_real(self) -> None:
        with self.assertRaises(ValueError):
            ThermalLimits(pause_at=80, resume_at=80).validate()
        with self.assertRaises(ValueError):
            ThermalLimits(pause_at=91, abort_at=90).validate()
        with self.assertRaises(ValueError):
            ThermalLimits(duty=-1).validate()

    def test_cli_overrides(self) -> None:
        import argparse

        parser = argparse.ArgumentParser()
        thermal.add_guard_arguments(parser)
        args = parser.parse_args(["--pause-at", "50", "--resume-at", "40", "--abort-at", "55"])
        limits = thermal.limits_from_args(args)
        self.assertEqual((limits.pause_at, limits.resume_at, limits.abort_at), (50, 40, 55))
        self.assertEqual(limits.batch_size, 10)
        args = parser.parse_args(["--profile", "desktop"])
        self.assertEqual(thermal.limits_from_args(args).abort_at, 83)
        args = parser.parse_args(["--resume-at", "86"])
        with self.assertRaises(ValueError):
            thermal.limits_from_args(args)


class StartTest(unittest.TestCase):
    def test_refuses_on_battery(self) -> None:
        guard, _, _ = make_guard(ScriptedSensor([60.0]), power=POWER_BATTERY)
        with self.assertRaises(GuardRefused):
            guard.start()

    def test_refuses_unknown_power_when_ac_required(self) -> None:
        guard, _, _ = make_guard(ScriptedSensor([60.0]), power=POWER_UNKNOWN)
        with self.assertRaises(GuardRefused):
            guard.start()

    def test_desktop_without_battery_is_fine(self) -> None:
        guard, _, _ = make_guard(
            ScriptedSensor([60.0]), limits=thermal.PROFILES["desktop"].limits, power=POWER_NO_BATTERY
        )
        self.assertEqual(guard.start(), 60.0)

    def test_refuses_without_sensor(self) -> None:
        guard, _, _ = make_guard(ScriptedSensor([SensorError("no counter")]))
        with self.assertRaises(GuardRefused):
            guard.start()

    def test_aborts_when_already_too_hot(self) -> None:
        guard, _, log = make_guard(ScriptedSensor([90.0]))
        with self.assertRaises(ThermalAbort):
            guard.start()
        self.assertEqual(events(log)[-1], "abort")

    def test_run_starts_guard_implicitly(self) -> None:
        guard, clock, _ = make_guard(ScriptedSensor([60.0]), power=POWER_BATTERY)
        with self.assertRaises(GuardRefused):
            guard.run("a", frame_taking(clock, 10))


class PauseTest(unittest.TestCase):
    def test_no_pause_below_threshold(self) -> None:
        guard, clock, log = make_guard(ScriptedSensor([84.9]))
        guard.start()
        self.assertEqual(guard.wait_until_cool(), 84.9)
        self.assertEqual(clock.now, 0)
        self.assertNotIn("pause", events(log))

    def test_pause_waits_down_to_resume_threshold(self) -> None:
        # Hot at 85, then cools 1 C per 5 s poll. 75 C is below pause but above
        # resume: the pause must continue until 70 C (hysteresis).
        clock = FakeClock()
        sensor = ScriptedSensor(fn=lambda t: max(60.0, 85.0 - t / 5.0), clock=clock)
        guard, clock, log = make_guard(sensor, clock=clock)
        guard.start()
        value = guard.wait_until_cool()
        self.assertLessEqual(value, 70.0)
        self.assertEqual(clock.now, 75.0)  # 15 polls of 5 s
        self.assertEqual(events(log)[-2:], ["pause", "resume"])

    def test_abort_during_pause(self) -> None:
        guard, _, log = make_guard(ScriptedSensor([60.0, 86.0, 88.0, 90.5]))
        guard.start()
        with self.assertRaises(ThermalAbort):
            guard.wait_until_cool()
        self.assertEqual(events(log)[-1], "abort")

    def test_pause_gives_up_if_not_cooling(self) -> None:
        guard, clock, _ = make_guard(
            ScriptedSensor([60.0, 86.0]), limits=ThermalLimits(max_pause=60, poll_interval=5)
        )
        guard.start()
        with self.assertRaises(ThermalAbort):
            guard.wait_until_cool()
        self.assertEqual(clock.now, 60.0)

    def test_sensor_lost_after_start_is_abort(self) -> None:
        guard, _, _ = make_guard(ScriptedSensor([60.0, SensorError("gone")]))
        guard.start()
        with self.assertRaises(ThermalAbort):
            guard.wait_until_cool()


class DutyCycleTest(unittest.TestCase):
    def test_rest_after_frame_is_not_shorter_than_frame(self) -> None:
        guard, clock, log = make_guard(ScriptedSensor([60.0]))
        result = guard.run("a", frame_taking(clock, 42.0))
        self.assertEqual(result, "image")
        self.assertGreaterEqual(clock.now, 84.0)  # 42 s frame + 42 s rest
        frame = next(r for r in log.rows if r["event"] == "frame")
        self.assertEqual(frame["frame"], "a")
        self.assertEqual(frame["seconds"], "42.0")
        self.assertEqual(frame["temp_before_c"], "60.0")
        self.assertEqual(frame["temp_after_c"], "60.0")
        rest = next(r for r in log.rows if r["event"] == "rest")
        self.assertEqual(rest["seconds"], "42.0")

    def test_min_rest(self) -> None:
        guard, _, _ = make_guard(ScriptedSensor([60.0]), limits=ThermalLimits(duty=1.0, min_rest=30))
        self.assertEqual(guard.rest_seconds(5), 30)
        self.assertEqual(guard.rest_seconds(50), 50)

    def test_abort_if_too_hot_after_frame(self) -> None:
        guard, clock, _ = make_guard(ScriptedSensor([60.0, 60.0, 91.0]))
        with self.assertRaises(ThermalAbort):
            guard.run("a", frame_taking(clock, 10))

    def test_abort_during_rest(self) -> None:
        guard, clock, _ = make_guard(ScriptedSensor([60.0, 60.0, 80.0, 90.0]))
        with self.assertRaises(ThermalAbort):
            guard.run("a", frame_taking(clock, 30))

    def test_watchdog_trip_aborts_frame(self) -> None:
        guard, clock, log = make_guard(ScriptedSensor([60.0]))

        def generate(watchdog):
            watchdog.tripped = True
            watchdog.reason = "92 C during frame"
            watchdog.check()

        with self.assertRaises(ThermalAbort):
            guard.run("a", generate)
        self.assertEqual(events(log)[-1], "abort")
        self.assertEqual(guard.frames_total, 0)

    def test_power_lost_mid_run_is_abort(self) -> None:
        state = {"power": POWER_AC}
        clock = FakeClock()
        sensor = ScriptedSensor([60.0], clock=clock)
        guard = ThermalGuard(
            sensor,
            ThermalLimits(),
            ThermalLog(None, echo=None),
            clock=clock,
            sleep=clock.sleep,
            power=lambda: state["power"],
            watchdog_factory=NullWatchdog,
        )
        guard.run("a", frame_taking(clock, 1))
        state["power"] = POWER_BATTERY
        with self.assertRaises(ThermalAbort):
            guard.run("b", frame_taking(clock, 1))


class BatchTest(unittest.TestCase):
    def test_break_after_each_batch(self) -> None:
        limits = ThermalLimits(batch_size=10, batch_break=600, duty=0)
        guard, clock, log = make_guard(ScriptedSensor([60.0]), limits=limits)
        for i in range(10):
            guard.run(f"f{i}", frame_taking(clock, 10))
        self.assertEqual(clock.now, 100)
        self.assertNotIn("batch_break", events(log))
        guard.run("f10", frame_taking(clock, 10))
        self.assertEqual(events(log).count("batch_break"), 1)
        self.assertEqual(clock.now, 100 + 600 + 10)
        for i in range(11, 20):
            guard.run(f"f{i}", frame_taking(clock, 10))
        self.assertEqual(events(log).count("batch_break"), 1)
        guard.run("f20", frame_taking(clock, 10))
        self.assertEqual(events(log).count("batch_break"), 2)

    def test_other_work_is_protected_but_not_counted(self) -> None:
        limits = ThermalLimits(batch_size=1, batch_break=600, duty=1.0)
        guard, clock, log = make_guard(ScriptedSensor([60.0]), limits=limits)
        guard.run("encode", frame_taking(clock, 20), counts=False)
        self.assertEqual(clock.now, 40)  # rest after work too
        guard.run("f0", frame_taking(clock, 10))
        self.assertNotIn("batch_break", events(log))
        self.assertEqual(events(log).count("work"), 1)
        self.assertEqual(guard.frames_total, 1)

    def test_no_batches_when_zero(self) -> None:
        limits = ThermalLimits(batch_size=0, duty=0)
        guard, clock, log = make_guard(ScriptedSensor([60.0]), limits=limits)
        for i in range(25):
            guard.run(f"f{i}", frame_taking(clock, 1))
        self.assertNotIn("batch_break", events(log))

    def test_still_hot_after_break_waits(self) -> None:
        limits = ThermalLimits(batch_size=1, batch_break=10, duty=0)
        readings = [60.0, 60.0, 60.0]  # start, before f0, after f0
        readings += [86.0, 86.0]  # during the break (2 polls)
        readings += [86.0, 75.0, 69.0]  # before f1: pause until 70
        readings += [65.0]
        guard, clock, log = make_guard(ScriptedSensor(readings), limits=limits)
        guard.run("f0", frame_taking(clock, 1))
        guard.run("f1", frame_taking(clock, 1))
        self.assertEqual(
            [e for e in events(log) if e in ("batch_break", "pause", "resume", "frame")],
            ["frame", "batch_break", "pause", "resume", "frame"],
        )


class WatchdogTest(unittest.TestCase):
    def test_trips_and_kills_if_frame_does_not_stop(self) -> None:
        killed = threading.Event()
        limits = ThermalLimits(poll_interval=0.01, kill_grace=0.05)
        sensor = ScriptedSensor([70.0, 80.0, 95.0])
        wd = Watchdog(sensor, limits, kill=lambda reason: killed.set()).start()
        self.assertTrue(killed.wait(2.0))
        self.assertTrue(wd.tripped)
        with self.assertRaises(ThermalAbort):
            wd.check()
        self.assertEqual(wd.peak, 95.0)  # the reading that tripped it is logged too
        wd.stop()

    def test_no_kill_if_frame_stops_in_time(self) -> None:
        killed = threading.Event()
        limits = ThermalLimits(poll_interval=0.01, kill_grace=1.0)
        wd = Watchdog(ScriptedSensor([95.0]), limits, kill=lambda reason: killed.set()).start()
        deadline = time.monotonic() + 2
        while not wd.tripped and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(wd.tripped)
        wd.stop()
        self.assertFalse(killed.is_set())

    def test_sensor_loss_trips(self) -> None:
        limits = ThermalLimits(poll_interval=0.01, kill_grace=0.0)
        wd = Watchdog(ScriptedSensor([SensorError("x")]), limits, kill=lambda r: None).start()
        deadline = time.monotonic() + 2
        while not wd.tripped and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(wd.tripped)
        wd.stop()

    def test_tracks_peak(self) -> None:
        limits = ThermalLimits(poll_interval=0.01)
        wd = Watchdog(ScriptedSensor([71.0, 77.0, 74.0]), limits, kill=lambda r: None).start()
        time.sleep(0.2)
        wd.stop()
        self.assertFalse(wd.tripped)
        self.assertEqual(wd.peak, 77.0)


class SensorParsingTest(unittest.TestCase):
    TYPEPERF = (
        '\r\n"(PDH-CSV 4.0)","\\\\HOST\\Thermal Zone Information(\\_TZ.THRM)\\High Precision Temperature",'
        '"\\\\HOST\\Thermal Zone Information(\\_TZ.CPUZ)\\High Precision Temperature"\r\n'
        '"10/08/2026 03:17:56.857","3332.000000","3481.000000"\r\n'
        "Exiting, please wait...\r\nThe command completed successfully.\r\n"
    )

    def test_typeperf(self) -> None:
        self.assertEqual(thermal.parse_typeperf(self.TYPEPERF), [3332.0, 3481.0])

    def test_typeperf_without_data(self) -> None:
        with self.assertRaises(SensorError):
            thermal.parse_typeperf("Error: No valid counters.\r\n")

    def test_windows_sensor_converts_kelvin_and_takes_hottest(self) -> None:
        sensor = thermal.WindowsThermalZoneSensor()
        original_run, original_which = thermal._run, thermal.shutil.which
        thermal._run = lambda cmd, timeout: self.TYPEPERF
        thermal.shutil.which = lambda name: name
        try:
            self.assertAlmostEqual(sensor.read(), 348.1 - 273.15, places=2)
        finally:
            thermal._run, thermal.shutil.which = original_run, original_which

    def test_implausible_value_is_sensor_error(self) -> None:
        with self.assertRaises(SensorError):
            thermal._check_plausible(-273.15, "x")

    def test_nvidia_smi(self) -> None:
        self.assertEqual(thermal.parse_nvidia_smi("54\n61\n"), [54.0, 61.0])
        with self.assertRaises(SensorError):
            thermal.parse_nvidia_smi("[N/A]\n")


class LockAndLogTest(unittest.TestCase):
    def test_second_lock_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gen.lock"
            with FileLock(path):
                with self.assertRaises(GuardRefused):
                    FileLock(path).acquire()
            with FileLock(path):
                pass  # released, can be taken again

    def test_csv_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "log.csv"
            log = ThermalLog(path, echo=None)
            log.write("frame", frame="a", temp_before_c=60.0, temp_after_c=71.5, seconds=42.0)
            log.write("pause", temp_c=86.0)
            with path.open(newline="", encoding="utf-8") as fh:
                rows = list(csv.DictReader(fh))
            self.assertEqual([r["event"] for r in rows], ["frame", "pause"])
            self.assertEqual(rows[0]["temp_after_c"], "71.5")
            self.assertEqual(rows[0]["seconds"], "42.0")


if __name__ == "__main__":
    unittest.main()
