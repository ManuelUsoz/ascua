# Third-party notices

## Supertonic (sample code)

Parts of `apps/renderer/src/app/core/voice/supertonic/` (text preprocessing and
the inference loop) are ported from `supertone-oss-archive/supertonic`
(commit `1e9799e9`, `web/helper.js`).

MIT License

Copyright (c) 2025 Supertone Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Supertonic 3 (model weights)

The model is licensed under Open RAIL-M (BigScience), which includes
use-based restrictions. Ascua does not redistribute it: it is downloaded at
runtime from the pinned Hugging Face revision
`supertone-oss-archive/supertonic-3@aafc6e32416a594460b32413efc49d7fe4ce6d46`.
See the LICENSE file at that revision:
https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE

## Whisper large-v3-turbo (model weights)

OpenAI Whisper large-v3-turbo, licensed under the MIT License. Ascua uses the
`onnx-community` ONNX conversion and does not redistribute it: it is downloaded
at runtime from the pinned Hugging Face revision
`onnx-community/whisper-large-v3-turbo@360ebcde2559d60bb474678be3c1de9ef347d01a`.

## Whisper small (model weights)

OpenAI Whisper small, licensed under the Apache License 2.0 (per the
`openai/whisper-small` model card). Ascua uses the `onnx-community` ONNX
conversion and does not redistribute it: it is downloaded at runtime from the
pinned Hugging Face revision
`onnx-community/whisper-small@36050c46d777d46dc4b5f43f6d90574fc38f8732`.
