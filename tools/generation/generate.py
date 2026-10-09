"""Batch generation of library stills with Z-Image-Turbo (docs/generation-plan.md).

Reads the prompt catalog (prompts.json), skips ids that already have a file,
generates the rest in priority order and writes each still to
``apps/web/public/library/stills/<id>.webp`` plus its entry in
``apps/web/public/library/library.json`` (``LibraryManifest`` from
packages/dream-core/src/film/library.ts).

Every frame goes through ThermalGuard (thermal.py): no sensor, no mains power
or a second generator -> refuse to start; too hot -> pause or emergency stop.
Encoded prompts are cached on disk (``cache/embeds``, outside git), so each
prompt is encoded once and the text encoder is not loaded at all when every
prompt of the run is cached.

    python generate.py --profile laptop --limit 1          # one frame on the laptop
    python generate.py --profile desktop --limit 50        # a batch on the desktop
    python generate.py --dry-run --limit 10                # show what would be generated
    python generate.py --encode-only --limit 10            # only fill the prompt cache
"""

from __future__ import annotations

import argparse
import dataclasses
import gc
import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable

import thermal

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DEFAULT_CATALOG = HERE / "prompts.json"
LIBRARY_DIR = REPO / "apps" / "web" / "public" / "library"
MANIFEST_NAME = "library.json"
DEFAULT_EMBED_CACHE = HERE / "cache" / "embeds"
STILLS_DIR = "stills"

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_LICENSE = "Apache-2.0"
# Same weights quantised to GGUF Q6_K (Apache-2.0): fits the laptop's shared memory.
LAPTOP_GGUF = "unsloth/Z-Image-Turbo-GGUF/z-image-turbo-Q6_K.gguf"

# Tag vocabulary of packages/dream-core/src/film/library.ts; a test keeps the
# two in sync.
LOCATION_TAGS = (
    "yard",
    "stairwell",
    "stairs",
    "hospital_corridor",
    "thermometer_corridor",
    "jam_jar",
    "bedroom",
    "kitchen",
    "elevator",
)
MOTIF_TAGS = ("swing", "vacuum_woman", "ventilator", "monitor", "thermometer", "pigeons", "will_papers")
PEOPLE_TAGS = ("none", "distant", "face")
MOOD_TAGS = ("calm", "uneasy", "dread", "scare")
TIME_TAGS = ("night", "dusk", "day", "interior")


# --------------------------------------------------------------------------
# Catalog


@dataclasses.dataclass(frozen=True)
class Scene:
    id: str
    priority: int
    tags: dict[str, Any]
    scene: str
    seed: int | None = None

    def prompt(self, style: str) -> str:
        return f"{self.scene.rstrip('. ')}. {style}"

    def generation_seed(self) -> int:
        """Explicit seed, or a stable one derived from the id."""
        if self.seed is not None:
            return self.seed
        digest = hashlib.sha256(self.id.encode("utf-8")).digest()
        return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


@dataclasses.dataclass(frozen=True)
class Catalog:
    model: str
    license: str
    style: str
    scenes: tuple[Scene, ...]


class CatalogError(ValueError):
    pass


def validate_tags(scene_id: str, tags: dict[str, Any]) -> None:
    def fail(msg: str) -> None:
        raise CatalogError(f"{scene_id}: {msg}")

    expected = {"location", "motifs", "people", "mood", "time"}
    if set(tags) != expected:
        fail(f"tags must have exactly {sorted(expected)}, got {sorted(tags)}")
    if tags["location"] not in LOCATION_TAGS:
        fail(f"unknown location {tags['location']!r}")
    if not isinstance(tags["motifs"], list) or any(m not in MOTIF_TAGS for m in tags["motifs"]):
        fail(f"unknown motifs {tags['motifs']!r}")
    if len(set(tags["motifs"])) != len(tags["motifs"]):
        fail("duplicate motifs")
    if tags["people"] not in PEOPLE_TAGS:
        fail(f"unknown people {tags['people']!r}")
    if tags["mood"] not in MOOD_TAGS:
        fail(f"unknown mood {tags['mood']!r}")
    if tags["time"] not in TIME_TAGS:
        fail(f"unknown time {tags['time']!r}")


def parse_catalog(data: dict[str, Any]) -> Catalog:
    if data.get("version") != 1:
        raise CatalogError("catalog version must be 1")
    scenes = []
    seen: set[str] = set()
    for raw in data["scenes"]:
        scene_id = raw["id"]
        if not scene_id or not all(c.isalnum() or c == "-" for c in scene_id) or scene_id != scene_id.lower():
            raise CatalogError(f"bad id {scene_id!r}: lowercase letters, digits and '-' only")
        if scene_id in seen:
            raise CatalogError(f"duplicate id {scene_id!r}")
        seen.add(scene_id)
        validate_tags(scene_id, raw["tags"])
        priority = raw["priority"]
        if not isinstance(priority, int) or priority < 1:
            raise CatalogError(f"{scene_id}: priority must be a positive integer")
        if not raw.get("scene", "").strip():
            raise CatalogError(f"{scene_id}: empty scene")
        scenes.append(Scene(scene_id, priority, raw["tags"], raw["scene"], raw.get("seed")))
    return Catalog(data["model"], data["license"], data["style"], tuple(scenes))


def load_catalog(path: Path) -> Catalog:
    with Path(path).open(encoding="utf-8") as fh:
        return parse_catalog(json.load(fh))


def select_scenes(
    catalog: Catalog,
    existing: Iterable[str],
    *,
    ids: list[str] | None = None,
    max_priority: int | None = None,
    limit: int | None = None,
) -> list[Scene]:
    """Scenes still to generate: not existing, by priority, then catalog order."""
    existing = set(existing)
    by_id = {s.id: s for s in catalog.scenes}
    if ids:
        unknown = [i for i in ids if i not in by_id]
        if unknown:
            raise CatalogError(f"unknown ids: {', '.join(unknown)}")
        pool = [by_id[i] for i in ids]
    else:
        pool = list(catalog.scenes)
    order = {s.id: n for n, s in enumerate(pool)}
    todo = [
        s
        for s in pool
        if s.id not in existing and (max_priority is None or s.priority <= max_priority)
    ]
    todo.sort(key=lambda s: (s.priority, order[s.id]))
    return todo[:limit] if limit is not None else todo


# --------------------------------------------------------------------------
# Manifest


def empty_manifest() -> dict[str, Any]:
    return {"version": 1, "assets": []}


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        return empty_manifest()
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("version") != 1 or not isinstance(data.get("assets"), list):
        raise ValueError(f"{path}: not a LibraryManifest v1")
    return data


def make_asset(
    scene: Scene,
    catalog: Catalog,
    *,
    width: int,
    height: int,
    source: str,
) -> dict[str, Any]:
    """A ``LibraryAsset`` (kind ``still``) for library.json."""
    return {
        "id": scene.id,
        "kind": "still",
        "file": f"{STILLS_DIR}/{scene.id}.webp",
        "width": width,
        "height": height,
        "tags": {
            "location": scene.tags["location"],
            "motifs": list(scene.tags["motifs"]),
            "people": scene.tags["people"],
            "mood": scene.tags["mood"],
            "time": scene.tags["time"],
        },
        "generation": {
            "model": catalog.model,
            "license": catalog.license,
            "prompt": scene.prompt(catalog.style),
            "seed": scene.generation_seed(),
            "source": source,
        },
    }


def upsert_asset(manifest: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
    assets = [a for a in manifest["assets"] if a["id"] != asset["id"]]
    assets.append(asset)
    return {**manifest, "assets": assets}


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def existing_ids(library: Path, manifest: dict[str, Any]) -> set[str]:
    """Ids that already have a still file or a manifest entry."""
    ids = {a["id"] for a in manifest["assets"]}
    stills = library / STILLS_DIR
    if stills.is_dir():
        ids |= {p.stem for p in stills.glob("*.webp")}
    return ids


# --------------------------------------------------------------------------
# Prompt embedding cache


class EmbedCache:
    """Encoded prompts on disk, one safetensors file per (model, dtype, prompt).

    The key does not depend on the device: a cache filled on the desktop can be
    copied to the laptop, which then never loads the text encoder.
    """

    FORMAT = 1

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def path(self, model_id: str, dtype: str, prompt: str) -> Path:
        key = "\n".join((f"v{self.FORMAT}", model_id, dtype, prompt))
        return self.root / f"{hashlib.sha256(key.encode('utf-8')).hexdigest()[:32]}.safetensors"

    def has(self, model_id: str, dtype: str, prompt: str) -> bool:
        return self.path(model_id, dtype, prompt).is_file()

    def load(self, model_id: str, dtype: str, prompt: str) -> list[Any]:
        from safetensors.torch import load_file

        tensors = load_file(self.path(model_id, dtype, prompt), device="cpu")
        return [tensors[name] for name in sorted(tensors)]

    def save(self, model_id: str, dtype: str, prompt: str, embeds: list[Any]) -> None:
        from safetensors.torch import save_file

        path = self.path(model_id, dtype, prompt)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        save_file({f"{n:04d}": e.contiguous() for n, e in enumerate(embeds)}, tmp)
        os.replace(tmp, path)


def split_cached(
    prompts: dict[str, str], cache: EmbedCache | None, model_id: str, dtype: str
) -> tuple[list[str], list[str]]:
    """Keys of ``prompts`` whose embeddings are (cached, still to encode)."""
    cached = [k for k, p in prompts.items() if cache is not None and cache.has(model_id, dtype, p)]
    return cached, [k for k in prompts if k not in cached]


# --------------------------------------------------------------------------
# Model (heavy imports stay inside functions so --dry-run and tests need no torch)


def _empty_cache(torch: Any, device: str) -> None:
    gc.collect()
    backend = getattr(torch, device.split(":")[0], None)
    if backend is not None and hasattr(backend, "empty_cache"):
        backend.empty_cache()


def _device_memory(torch: Any, device: str) -> tuple[float, float] | None:
    """(peak allocated, peak reserved) on the device, GiB."""
    backend = getattr(torch, device.split(":")[0], None)
    if backend is None or not hasattr(backend, "max_memory_allocated"):
        return None
    return backend.max_memory_allocated() / 2**30, backend.max_memory_reserved() / 2**30


def _process_peak_gib() -> float | None:
    try:
        import psutil
    except ImportError:
        return None
    info = psutil.Process().memory_info()
    peak = getattr(info, "peak_wset", None) or getattr(info, "rss", None)
    return peak / 2**30 if peak else None


def resolve_gguf(spec: str) -> str:
    """Local path, or ``owner/repo/file.gguf`` downloaded to the Hugging Face cache."""
    if Path(spec).exists():
        return spec
    parts = spec.split("/")
    if len(parts) < 3 or not spec.endswith(".gguf"):
        raise ValueError(f"--gguf: expected a file or owner/repo/file.gguf, got {spec!r}")
    from huggingface_hub import hf_hub_download

    return hf_hub_download("/".join(parts[:2]), "/".join(parts[2:]))


class Generator:
    """Z-Image-Turbo in two stages to fit the laptop's shared memory.

    Stage 1 loads only the text encoder, encodes the prompts of the run that
    are not in the disk cache and unloads it; stage 2 loads the transformer and
    VAE and denoises from the embeddings. Peak memory is the larger stage instead of the sum
    (~8 GiB text encoder + ~12 GiB transformer in bf16). The transformer can be
    a GGUF quantisation of the same weights (``gguf``) to fit in less memory.
    ``offload`` instead uses diffusers' model CPU offload with the whole
    pipeline.
    """

    def __init__(
        self,
        model_id: str,
        device: str,
        dtype: str,
        *,
        two_stage: bool,
        offload: bool,
        encoder_device: str | None = None,
        encoder_threads: int | None = None,
        gguf: str | None = None,
        cache: EmbedCache | None = None,
    ) -> None:
        import torch

        self.torch = torch
        self.model_id = model_id
        self.device = device
        self.encoder_device = encoder_device or device
        self.encoder_threads = encoder_threads
        self.cache = cache
        self.dtype_name = dtype
        self.dtype = getattr(torch, dtype)
        self.two_stage = two_stage
        self.offload = offload
        self.gguf = gguf
        self.pipe: Any = None
        self.embeds: dict[str, Any] = {}

    def encode(self, prompts: dict[str, str], guard: thermal.ThermalGuard) -> None:
        """Embeddings for every prompt: from the disk cache or the text encoder.

        Loading the encoder and each prompt are separate pieces of protected
        work, so the guard cools down between them and nothing is lost on an
        emergency stop: every embedding is written to the cache at once.
        """
        if not self.two_stage:
            return
        torch = self.torch
        cached, todo = split_cached(prompts, self.cache, self.model_id, self.dtype_name)
        for key in cached:
            self.embeds[key] = self.cache.load(self.model_id, self.dtype_name, prompts[key])
        print(f"[gen] prompts: {len(cached)} from cache, {len(todo)} to encode")
        if not todo:
            return

        from diffusers import ZImagePipeline
        from transformers import AutoModel, AutoTokenizer

        def load_encoder(watchdog: thermal.Watchdog) -> Any:
            tokenizer = AutoTokenizer.from_pretrained(self.model_id, subfolder="tokenizer")
            text_encoder = AutoModel.from_pretrained(
                self.model_id, subfolder="text_encoder", dtype=self.dtype, device_map=self.encoder_device
            )
            text_encoder.eval()
            # Reuse the pipeline's own prompt encoding (chat template, hidden layer).
            return ZImagePipeline(
                scheduler=None, vae=None, text_encoder=text_encoder, tokenizer=tokenizer, transformer=None
            )

        def encode_one(key: str) -> list[Any]:
            with torch.inference_mode():
                embeds = shell._encode_prompt(prompts[key], device=torch.device(self.encoder_device))
            return [e.to("cpu") for e in embeds]

        started = time.monotonic()
        threads = torch.get_num_threads()
        if self.encoder_threads:
            torch.set_num_threads(self.encoder_threads)
        shell = None
        try:
            shell = guard.run("load-text-encoder", load_encoder, counts=False, encode=True)
            for key in todo:
                self.embeds[key] = guard.run(
                    f"encode:{key}", lambda wd, k=key: encode_one(k), counts=False, encode=True
                )
                if self.cache is not None:
                    self.cache.save(self.model_id, self.dtype_name, prompts[key], self.embeds[key])
        finally:
            del shell
            _empty_cache(torch, self.encoder_device)
            torch.set_num_threads(threads)
        print(
            f"[gen] encoded {len(todo)} prompt(s) on {self.encoder_device} in "
            f"{time.monotonic() - started:.1f} s (with rests); text encoder unloaded"
        )

    def load(self) -> None:
        from diffusers import ZImagePipeline

        started = time.monotonic()
        if self.two_stage:
            from diffusers import AutoencoderKL, FlowMatchEulerDiscreteScheduler, ZImageTransformer2DModel

            if self.gguf:
                from diffusers import GGUFQuantizationConfig

                transformer = ZImageTransformer2DModel.from_single_file(
                    resolve_gguf(self.gguf),
                    quantization_config=GGUFQuantizationConfig(compute_dtype=self.dtype),
                    config=self.model_id,
                    subfolder="transformer",
                    torch_dtype=self.dtype,
                    device=self.device,  # straight from the memory-mapped file to the device
                )
            else:
                transformer = ZImageTransformer2DModel.from_pretrained(
                    self.model_id, subfolder="transformer", torch_dtype=self.dtype, device_map=self.device
                )
            vae = AutoencoderKL.from_pretrained(self.model_id, subfolder="vae", torch_dtype=self.dtype).to(
                self.device
            )
            scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(self.model_id, subfolder="scheduler")
            self.pipe = ZImagePipeline(
                scheduler=scheduler, vae=vae, text_encoder=None, tokenizer=None, transformer=transformer
            )
        else:
            self.pipe = ZImagePipeline.from_pretrained(self.model_id, torch_dtype=self.dtype)
            if self.offload:
                self.pipe.enable_model_cpu_offload(device=self.device)
            else:
                self.pipe.to(self.device)
        self.pipe.set_progress_bar_config(disable=True)
        print(f"[gen] model loaded in {time.monotonic() - started:.1f} s")

    def generate(
        self,
        key: str,
        prompt: str,
        seed: int,
        *,
        width: int,
        height: int,
        steps: int,
        watchdog: thermal.Watchdog,
    ) -> Any:
        torch = self.torch

        def on_step(pipe: Any, step: int, timestep: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
            watchdog.check()  # raises ThermalAbort mid-frame
            return kwargs

        # CPU generator: the same seed gives the same initial noise on xpu and cuda.
        generator = torch.Generator("cpu").manual_seed(seed)
        args: dict[str, Any] = dict(
            height=height,
            width=width,
            num_inference_steps=steps,
            guidance_scale=0.0,
            generator=generator,
            callback_on_step_end=on_step,
        )
        if self.two_stage:
            args["prompt_embeds"] = [e.to(self.device) for e in self.embeds[key]]
        else:
            args["prompt"] = prompt
        watchdog.check()
        with torch.inference_mode():
            image = self.pipe(**args).images[0]
        if self.device.startswith("xpu"):
            torch.xpu.synchronize()
        return image


def save_webp(image: Any, path: Path, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".webp.tmp")
    image.save(tmp, format="WEBP", quality=quality, method=6)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# CLI


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--library", type=Path, default=LIBRARY_DIR, help="library root (stills/ and library.json)")
    parser.add_argument("--ids", nargs="+", help="generate only these catalog ids")
    parser.add_argument("--max-priority", type=int, help="only scenes with priority <= this")
    parser.add_argument("--limit", type=int, default=10, help="frames in this run (default 10 = one laptop batch)")
    parser.add_argument("--device", help="torch device: xpu (laptop), cuda (desktop); default from --profile")
    parser.add_argument("--dtype", default="bfloat16", choices=["bfloat16", "float16"])
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--steps", type=int, default=8, help="denoising steps = DiT forwards (8 for Turbo)")
    parser.add_argument("--quality", type=int, default=82, help="WebP quality")
    parser.add_argument(
        "--pipeline",
        choices=["two-stage", "full", "offload"],
        default="two-stage",
        help="two-stage: text encoder and transformer never in memory together (laptop); "
        "full: whole pipeline on the device; offload: diffusers model CPU offload",
    )
    parser.add_argument(
        "--gguf",
        help="GGUF transformer instead of the bf16 one: a file or owner/repo/file.gguf, "
        f"e.g. {LAPTOP_GGUF} (laptop)",
    )
    parser.add_argument(
        "--encoder-device",
        help="device for the text encoder in two-stage mode (default: same as --device)",
    )
    parser.add_argument(
        "--encoder-threads",
        type=int,
        help="CPU threads for the text encoder, 0 = torch default (laptop 4: fewer cores, less heat)",
    )
    parser.add_argument(
        "--embed-cache",
        type=Path,
        default=DEFAULT_EMBED_CACHE,
        help="directory of encoded prompts (outside git); each prompt is encoded once",
    )
    parser.add_argument("--no-embed-cache", action="store_true", help="neither read nor write the prompt cache")
    parser.add_argument(
        "--encode-only",
        action="store_true",
        help="encode the prompts into the cache and stop: no transformer, no frames",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the plan, load nothing")
    thermal.add_guard_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        limits = thermal.limits_from_args(args)
    except ValueError as exc:
        parser.error(str(exc))
    if args.width % 16 or args.height % 16:
        parser.error("width and height must be multiples of 16")
    if args.encode_only and (args.no_embed_cache or args.pipeline != "two-stage"):
        parser.error("--encode-only needs the prompt cache and --pipeline two-stage")
    profile = thermal.PROFILES[args.profile]
    device = args.device or profile.default_device
    encoder_threads = profile.encoder_threads if args.encoder_threads is None else args.encoder_threads
    cache = None if args.no_embed_cache else EmbedCache(args.embed_cache)

    catalog = load_catalog(args.catalog)
    manifest_path = args.library / MANIFEST_NAME
    manifest = load_manifest(manifest_path)
    todo = select_scenes(
        catalog,
        existing_ids(args.library, manifest),
        ids=args.ids,
        max_priority=args.max_priority,
        limit=args.limit,
    )
    print(f"[gen] profile {profile.name}, device {device}, {len(todo)} frame(s) to generate")
    for scene in todo:
        print(f"  p{scene.priority} {scene.id} seed={scene.generation_seed()}")
    if args.dry_run or not todo:
        return 0

    log = thermal.ThermalLog(thermal.log_path_from_args(args))
    print(f"[thermal] {thermal.describe(limits)}; log {log.path}")
    try:
        with thermal.FileLock(args.lock):
            guard = thermal.ThermalGuard(profile.sensor(), limits, log)
            guard.start()
            guard.wait_until_cool()  # do not even load the model while hot
            gen = Generator(
                catalog.model,
                device,
                args.dtype,
                two_stage=args.pipeline == "two-stage",
                offload=args.pipeline == "offload",
                encoder_device=args.encoder_device,
                encoder_threads=encoder_threads,
                gguf=args.gguf,
                cache=cache,
            )
            prompts = {s.id: s.prompt(catalog.style) for s in todo}
            # Prompt encoding is model work too: protected, but not a frame.
            gen.encode(prompts, guard)
            if args.encode_only:
                print("[gen] prompts encoded; --encode-only: no frames")
                return 0
            guard.wait_until_cool()
            gen.load()
            for n, scene in enumerate(todo, 1):
                print(f"[gen] {n}/{len(todo)} {scene.id}")
                image = guard.run(
                    scene.id,
                    lambda wd, s=scene: gen.generate(
                        s.id,
                        s.prompt(catalog.style),
                        s.generation_seed(),
                        width=args.width,
                        height=args.height,
                        steps=args.steps,
                        watchdog=wd,
                    ),
                )
                save_webp(image, args.library / STILLS_DIR / f"{scene.id}.webp", args.quality)
                manifest = upsert_asset(
                    load_manifest(manifest_path),
                    make_asset(scene, catalog, width=args.width, height=args.height, source=profile.source),
                )
                write_json_atomic(manifest_path, manifest)
                mem = _device_memory(gen.torch, device)
                peak = _process_peak_gib()
                print(
                    "[gen] saved "
                    + f"{scene.id}.webp"
                    + (f"; device peak {mem[0]:.1f} GiB allocated / {mem[1]:.1f} GiB reserved" if mem else "")
                    + (f"; process peak {peak:.1f} GiB" if peak else "")
                )
    except thermal.GuardRefused as exc:
        print(f"[thermal] refused: {exc}", file=sys.stderr)
        return thermal.EXIT_REFUSED
    except thermal.ThermalAbort as exc:
        print(f"[thermal] EMERGENCY STOP: {exc}", file=sys.stderr)
        return thermal.EXIT_THERMAL_ABORT
    print("[gen] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
