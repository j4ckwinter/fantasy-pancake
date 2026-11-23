import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { heightBreakpoints, widthBreakpoints } from "./breakpoints";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const tokensFile = path.join("app", "tokens.css");

const namedColors =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );
const rawColor = new RegExp(
  `#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(`,
  "i",
);
const namedColor = new RegExp(
  `(?<![\\w-])(?:${namedColors.join("|")})(?![\\w-])`,
  "i",
);
const colorProperty =
  /color|background|border|outline|fill|stroke|shadow|decoration|caret|accent|column-rule/;
const rawLength =
  /(?<![\w.-])-?\d*\.?\d+(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|svh|lvh|dvh|cm|mm|in|pt|pc)(?![\w-])/i;
const tokenisedProperty =
  /^(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|scroll-margin|scroll-padding)(?:-|$)|^font(?:-size)?$|radius|^(?:box|text)-shadow$|^z-index$/;

type Declaration = {
  file: string;
  line: number;
  property: string;
  value: string;
};
type MediaQuery = { file: string; line: number; query: string };

function sourceFiles(extension: RegExp) {
  return fs
    .readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
    .filter((file) => extension.test(file) && !/\.test\.tsx?$/.test(file));
}

function read(file: string) {
  return fs
    .readFileSync(path.join(sourceRoot, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function lineAt(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}

function declarations(file: string): Declaration[] {
  const text = read(file);
  return [
    ...text.matchAll(
      /(?<=[{;]\s*)(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g,
    ),
  ].map((match) => ({
    file,
    line: lineAt(text, match.index),
    property: match[1],
    value: match[2].replace(/"[^"]*"|'[^']*'/g, '""'),
  }));
}

function mediaQueries(file: string): MediaQuery[] {
  const text = read(file);
  return [...text.matchAll(/@media([^{]+)\{/g)].map((match) => ({
    file,
    line: lineAt(text, match.index),
    query: match[1].trim(),
  }));
}

const cssFiles = sourceFiles(/\.css$/);
const appCssFiles = cssFiles.filter((file) => file !== tokensFile);
const appDeclarations = appCssFiles.flatMap(declarations);
const where = ({ file, line }: { file: string; line: number }) =>
  `${file}:${line}`;
const withoutTokens = (value: string) =>
  value.replace(/var\(--[\w-]+\)/g, "").replace(/env\([^)]*\)/g, "");

describe("style files", () => {
  it("take every colour from a design token", () => {
    const offenders = appDeclarations.filter(
      ({ property, value }) =>
        rawColor.test(value) ||
        ((colorProperty.test(property) || property.startsWith("--")) &&
          namedColor.test(value)),
    );
    expect(
      offenders.map((d) => `${where(d)} ${d.property}: ${d.value}`),
    ).toEqual([]);
  });

  it("take spacing, type sizes, radii, shadows and layers from design tokens", () => {
    const offenders = appDeclarations.filter(
      ({ property, value }) =>
        (tokenisedProperty.test(property) ||
          (/filter$/.test(property) && value.includes("drop-shadow"))) &&
        (rawLength.test(withoutTokens(value)) ||
          (property === "z-index" &&
            /\d/.test(withoutTokens(value).replace(/^0$/, "")))),
    );
    expect(
      offenders.map((d) => `${where(d)} ${d.property}: ${d.value}`),
    ).toEqual([]);
  });

  it("define custom properties with raw values only in the tokens file", () => {
    const offenders = appDeclarations.filter(
      ({ property, value }) =>
        property.startsWith("--") &&
        (rawColor.test(value) ||
          namedColor.test(value) ||
          rawLength.test(withoutTokens(value))),
    );
    expect(
      offenders.map((d) => `${where(d)} ${d.property}: ${d.value}`),
    ).toEqual([]);
  });

  it("refer only to tokens that the tokens file defines", () => {
    const defined = new Set(
      declarations(tokensFile).map(({ property }) => property),
    );
    const offenders = cssFiles
      .flatMap(declarations)
      .flatMap((d) =>
        [
          ...d.value.matchAll(
            /var\((--(?:color|space|text|radius|shadow|z)-[\w-]+)\)/g,
          ),
        ]
          .filter(([, token]) => !defined.has(token))
          .map(([, token]) => `${where(d)} ${token}`),
      );
    expect(offenders).toEqual([]);
  });

  it("use only the named breakpoints in media queries", () => {
    const named: Record<string, number[]> = {
      width: Object.values(widthBreakpoints),
      height: Object.values(heightBreakpoints),
    };
    const sizeFeature =
      /(?:(?:min|max)-)?(width|height)\s*(?::|[<>]=?)\s*([\d.]+)([a-z]*)/g;
    const usesUnnamedSize = (query: string) =>
      [...query.matchAll(sizeFeature)].some(
        ([, dimension, amount, unit]) =>
          unit !== "px" || !named[dimension].includes(Number(amount)),
      ) || /\d/.test(query.replace(sizeFeature, ""));
    const offenders = cssFiles
      .flatMap(mediaQueries)
      .filter(({ query }) => usesUnnamedSize(query));
    expect(offenders.map((m) => `${where(m)} @media ${m.query}`)).toEqual([]);
  });
});

describe("components", () => {
  const components = sourceFiles(/\.tsx?$/).map((file) => ({
    file,
    text: read(file),
  }));

  it("leave colours, inline styles and media widths to the style files", () => {
    const offenders = components.flatMap(({ file, text }) =>
      [
        ...text.matchAll(
          /["'`]#[0-9a-f]{3,8}["'`]|style=\{\{|matchMedia\(\s*["'`][^"'`]*\d/gi,
        ),
      ].map((match) => `${file}:${lineAt(text, match.index)} ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
