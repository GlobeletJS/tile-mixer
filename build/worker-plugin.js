// Plugin to import worker bundle as a template literal
export function worker() {
  return { transform };
}

function transform(source, id) {
  // Confirm this is the worker bundle
  if (/worker\.bundle\.js/.test(id) === false) return;

  return {
    code: "export default String.raw`" + source + "`",
    map: { mappings: '' }, // No map
  };
}
