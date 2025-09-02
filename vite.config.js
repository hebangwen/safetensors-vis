import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { devLogger } from '@meituan-nocode/vite-plugin-dev-logger';
import {
  devHtmlTransformer,
  prodHtmlTransformer,
} from '@meituan-nocode/vite-plugin-nocode-html-transformer';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const CHAT_VARIABLE = env.CHAT_VARIABLE || '';
  const PUBLIC_PATH = env.VITE_PUBLIC_PATH || '';
  console.log('VITE_PUBLIC_PATH:', env.VITE_PUBLIC_PATH);

  const isProdEnv = env.NODE_ENV === 'production';
  const publicPath = (isProdEnv && CHAT_VARIABLE)
    ? PUBLIC_PATH + '/' + CHAT_VARIABLE
    : PUBLIC_PATH + '/';
  const outDir = (isProdEnv && CHAT_VARIABLE) ? 'build/' + CHAT_VARIABLE : 'build';
  const plugins = isProdEnv
    ? CHAT_VARIABLE
      ? [react(), prodHtmlTransformer(CHAT_VARIABLE)]
      : [react()]
    : [
        devLogger({
          dirname: resolve(tmpdir(), '.nocode-dev-logs'),
          maxFiles: '3d',
        }),
        react(),
        devHtmlTransformer(CHAT_VARIABLE),
      ];

  return {
    server: {
      host: '::',
      port: '8080',
      hmr: {
        overlay: false,
      },
    },
    plugins,
    base: publicPath,
    build: {
      outDir,
    },
    resolve: {
      alias: [
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
        {
          find: 'lib',
          replacement: resolve(__dirname, 'lib'),
        },
      ],
    },
  };
});
