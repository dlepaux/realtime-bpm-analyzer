import {esbuildPlugin} from '@web/dev-server-esbuild';

export default {
  open: false,
  watch: false,
  nodeResolve: true,
  appIndex: 'testing/index.html',
  rootDir: '.',
  plugins: [esbuildPlugin({ts: true, target: 'auto'})],
};
