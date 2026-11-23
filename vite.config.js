import { defineConfig } from 'vite';

export default defineConfig({
  input: { explorer: 'index.html', classic: 'classic.html' },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/ },
            { name: 'three-renderer', test: /node_modules[\\/]three[\\/]build[\\/]three\.module\.js$/ },
            { name: 'three-controls', test: /node_modules[\\/]three[\\/]examples[\\/]jsm[\\/]controls[\\/]/ },
          ],
        },
      },
    },
  },
  base: '/mauritius-3D-openworld/',
});
