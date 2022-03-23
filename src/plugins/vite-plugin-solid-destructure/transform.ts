const { mapProps } = require('./helpers');

export default function transform(
  filename: string,
  source: string
): { code: string; map: null } | null {
  const code = mapProps(source, filename);

  return {
    code,
    map: null,
  };
}
