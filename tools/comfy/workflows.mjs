/**
 * ComfyUI graphs in the API format ("Export (API)" in ComfyUI): the owner's
 * Z-Image-Turbo and Wan 2.2 TI2V-5B templates with the prompt, seed, size and
 * file name of one job filled in. Nodes are found by their type and links,
 * not by their ids, so a fresh export of the same template still fits.
 */

import { readFileSync } from 'node:fs';

/** Reads a graph exported in the API format. */
export function readWorkflow(path) {
  const workflow = JSON.parse(readFileSync(path, 'utf8'));
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new Error(`${path}: not a ComfyUI graph`);
  for (const [id, node] of Object.entries(workflow)) {
    if (!node || typeof node.class_type !== 'string' || typeof node.inputs !== 'object') {
      throw new Error(`${path}: node ${id} has no class_type/inputs — export the graph with "Export (API)"`);
    }
  }
  return workflow;
}

/** The only node of `classType`; throws when there is none or more than one. */
export function only(workflow, classType) {
  const found = Object.entries(workflow).filter(([, node]) => node.class_type === classType);
  if (found.length !== 1) throw new Error(`The graph must have exactly one ${classType} node, it has ${found.length}`);
  return found[0][1];
}

/** The node an input of `node` is linked to (`[id, output]` in the API format). */
function linked(workflow, node, input) {
  const link = node.inputs[input];
  if (!Array.isArray(link)) throw new Error(`${node.class_type}.${input} is not linked`);
  const target = workflow[String(link[0])];
  if (!target) throw new Error(`${node.class_type}.${input} is linked to a missing node ${link[0]}`);
  return target;
}

/** The text encoder that feeds the sampler's positive prompt. */
function positivePrompt(workflow) {
  const encoder = linked(workflow, only(workflow, 'KSampler'), 'positive');
  if (encoder.class_type !== 'CLIPTextEncode') throw new Error(`The positive prompt comes from ${encoder.class_type}, not CLIPTextEncode`);
  return encoder;
}

/** Model files the graph loads, by loader input (`unet_name`, `clip_name`, `vae_name`). */
export function modelFiles(workflow) {
  const files = [];
  for (const [classType, input, folder] of [
    ['UNETLoader', 'unet_name', 'diffusion_models'],
    ['CLIPLoader', 'clip_name', 'text_encoders'],
    ['VAELoader', 'vae_name', 'vae'],
  ]) {
    for (const node of Object.values(workflow)) {
      if (node.class_type === classType) files.push({ folder, file: node.inputs[input] });
    }
  }
  return files;
}

function checkSeed(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`Bad seed ${seed}`);
}

/**
 * A still: Z-Image-Turbo, 1280×720 by default. `prefix` is the file name in
 * ComfyUI's `output` (ComfyUI appends `_00001_.png`).
 */
export function buildStill(template, { prompt, seed, prefix, width = 1280, height = 720 }) {
  checkSeed(seed);
  const workflow = structuredClone(template);
  positivePrompt(workflow).inputs.text = prompt;
  only(workflow, 'KSampler').inputs.seed = seed;
  const latent = only(workflow, 'EmptySD3LatentImage');
  latent.inputs.width = width;
  latent.inputs.height = height;
  latent.inputs.batch_size = 1;
  only(workflow, 'SaveImage').inputs.filename_prefix = prefix;
  return workflow;
}

/**
 * A clip: Wan 2.2 TI2V-5B from a still already uploaded to ComfyUI's `input`
 * (`image` is its name there, `subfolder/name.webp`), 1280×704, 121 frames
 * (5 s at 24 fps) by default.
 */
export function buildClip(template, { prompt, seed, prefix, image, width = 1280, height = 704, length = 121 }) {
  checkSeed(seed);
  const workflow = structuredClone(template);
  positivePrompt(workflow).inputs.text = prompt;
  only(workflow, 'KSampler').inputs.seed = seed;
  const latent = only(workflow, 'Wan22ImageToVideoLatent');
  const load = linked(workflow, latent, 'start_image');
  if (load.class_type !== 'LoadImage') throw new Error(`The clip starts from ${load.class_type}, not LoadImage`);
  load.inputs.image = image;
  latent.inputs.width = width;
  latent.inputs.height = height;
  latent.inputs.length = length;
  latent.inputs.batch_size = 1;
  only(workflow, 'SaveVideo').inputs.filename_prefix = prefix;
  return workflow;
}
