import type { Plugin, UserConfig } from 'vite';
import transform from './transform';

const transformableExtensions = ['.jsx', '.tsx'];

function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index < 0 ? '' : filename.substring(index);
}

/** Configuration options for the vite-plugin-solid-props-destructuring */
export interface Options {}

export default function destructurePlugin(options: Options = {}): Plugin {
  let needHmr = false;

  return {
    name: 'solid-destructure',
    enforce: 'pre',

    config(): UserConfig {
      return {
        resolve: {
          conditions: ['solid'],
          dedupe: [],
        },
        optimizeDeps: {
          include: [],
        },
      } as UserConfig;
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && config.mode !== 'production';
    },

    async transform(source, id) {
      const currentFileExtension = getExtension(id);

      const extensionsToWatch = [...transformableExtensions];

      if (!extensionsToWatch.includes(currentFileExtension)) {
        return null;
      }

      return transform(id, source);
    },
  };
}
