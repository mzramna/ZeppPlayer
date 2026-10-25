// Module resolve hook: @zos/*, @zeppos/zml/* and the settings page's "i18n" -> test/mocks.
const MOCKS = new URL("../mocks/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@zos/")) {
    return { url: new URL(`zos/${specifier.slice(5)}.js`, MOCKS).href, shortCircuit: true };
  }
  if (specifier === "i18n") {
    return { url: new URL("i18n.js", MOCKS).href, shortCircuit: true };
  }
  if (specifier.startsWith("@zeppos/zml/")) {
    return { url: new URL(`zml/${specifier.slice(12)}.js`, MOCKS).href, shortCircuit: true };
  }
  return next(specifier, context);
}
