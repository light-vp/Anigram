// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The entry of dist/living-diagram.js: one ES module, React included, that
 * defines <living-diagram>. Its stylesheet is folded into the module at build
 * time and put in each element's shadow root, with `:root` rewritten to
 * `:host` so the design tokens land on the element.
 */

import '../styles/reset.css'
import '../styles/tokens.css'
import '../styles/global.css'
import './element.css'

import { define } from './LivingDiagram.tsx'

define()
