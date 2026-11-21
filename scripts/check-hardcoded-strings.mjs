#!/usr/bin/env node
// Fails when a component in app/, features/ or components/ renders English text that
// does not come from messages/*.json. It reports JSX text, prose attributes
// (label, title, placeholder, aria-label, alt, description, caption) and prose string
// or template literals rendered directly inside JSX.
//
// usage: node scripts/check-hardcoded-strings.mjs [--json]
// Allowed exceptions live in scripts/hardcoded-strings-allowlist.json as
// { "path/to/file.tsx": ["exact text", ...] }.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["app", "features", "components"];
const PROSE_ATTRS = new Set(["label", "title", "placeholder", "aria-label", "alt", "description", "caption", "aria-description"]);

// Text that is the same in every language: product names, units, symbols, code tokens.
const UNIVERSAL = /^(ExpressHub|Stripe|Google|OpenAI|API|URL|ID|PDF|JSON|CSV|HTTP|HTTPS|EN|বাংলা|kg|BDT|OK|N\/A|©.*|[\p{P}\p{S}\d\s·×→←↑↓…]+)$/u;

export function isProse(text) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || UNIVERSAL.test(value)) return false;
  if (!/[A-Za-z]{2}/.test(value)) return false;
  if (/^[A-Z0-9_.:-]+$/.test(value)) return false; // ENUM_VALUES and codes
  if (/^[a-z0-9_.:/#?=&-]+$/.test(value)) return false; // identifiers, routes, scopes
  if (/^(https?:|\/|#|@|mailto:)/.test(value)) return false;
  return true;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (full.endsWith(".tsx")) files.push(full);
  }
  return files;
}

function insideCode(path) {
  return path.some((node) => node.type === "JSXElement" && ["code", "pre", "kbd", "samp"].includes(node.openingElement.name.name));
}

function templateText(node) {
  return node.quasis.map((q) => q.value.cooked ?? "").join(" ");
}

// Expressions whose string value ends up on screen when used as a JSX child or prose attribute.
function renderedStrings(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "StringLiteral": out.push(node.value); break;
    case "TemplateLiteral": out.push(templateText(node)); break;
    case "ConditionalExpression": renderedStrings(node.consequent, out); renderedStrings(node.alternate, out); break;
    case "LogicalExpression": renderedStrings(node.right, out); if (node.operator !== "&&") renderedStrings(node.left, out); break;
    case "BinaryExpression": if (node.operator === "+") { renderedStrings(node.left, out); renderedStrings(node.right, out); } break;
    default: break;
  }
  return out;
}

export function findStrings(source, file = "file.tsx") {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const found = [];
  const add = (text, node) => {
    const value = text.replace(/\s+/g, " ").trim();
    if (isProse(value)) found.push({ file, line: node.loc.start.line, text: value });
  };
  const visit = (node, path) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXText" && !insideCode(path)) add(node.value, node);
    if (node.type === "JSXExpressionContainer" && path.at(-1)?.type !== "JSXAttribute" && !insideCode(path)) {
      for (const text of renderedStrings(node.expression)) add(text, node);
    }
    if (node.type === "JSXAttribute" && PROSE_ATTRS.has(node.name.name) && node.value) {
      if (node.value.type === "StringLiteral") add(node.value.value, node);
      else if (node.value.type === "JSXExpressionContainer") for (const text of renderedStrings(node.value.expression)) add(text, node);
    }
    const next = [...path, node];
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c, next));
      else if (child && typeof child.type === "string") visit(child, next);
    }
  };
  visit(ast.program, []);
  return found;
}

function main() {
  const allow = JSON.parse(readFileSync(join(root, "scripts/hardcoded-strings-allowlist.json"), "utf8"));
  const problems = [];
  for (const dir of DIRS) {
    for (const full of walk(join(root, dir))) {
      const file = relative(root, full).split(sep).join("/");
      const allowed = new Set(allow[file] ?? []);
      for (const hit of findStrings(readFileSync(full, "utf8"), file)) {
        if (!allowed.has(hit.text)) problems.push(hit);
      }
    }
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(problems, null, 2));
  } else if (problems.length) {
    for (const p of problems) console.error(`${p.file}:${p.line}  ${JSON.stringify(p.text)}`);
    console.error(`\n${problems.length} hardcoded string(s). Move them to messages/en.json and messages/bn.json, or add a justified entry to scripts/hardcoded-strings-allowlist.json.`);
  } else {
    console.log("No hardcoded UI strings found.");
  }
  process.exitCode = problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
