const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy static files
fs.copyFileSync('manifest.json', 'dist/manifest.json');
if (fs.existsSync('src/popup/popup.html')) {
  fs.copyFileSync('src/popup/popup.html', 'dist/popup.html');
}
if (fs.existsSync('src/popup/popup.css')) {
  fs.copyFileSync('src/popup/popup.css', 'dist/popup.css');
}

// Copy assets
if (!fs.existsSync('dist/assets')) {
  fs.mkdirSync('dist/assets', { recursive: true });
}
if (fs.existsSync('assets')) {
  const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png'];
  iconFiles.forEach(icon => {
    const srcPath = path.join('assets', icon);
    const destPath = path.join('dist', 'assets', icon);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

// Build options
const buildOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome90'],
  format: 'esm',
};

// Build files
async function build() {
  try {
    // Background script
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/background/background.ts'],
      outfile: 'dist/background.js',
    });

    // Popup script
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/popup/popup.ts'],
      outfile: 'dist/popup.js',
    });

    // Content script (fetch) - must use IIFE format for Chrome
    await esbuild.build({
      ...buildOptions,
      format: 'iife', // Override ESM format for content scripts
      entryPoints: ['src/popup/fetch.ts'],
      outfile: 'dist/fetch.js',
    });

    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

if (isWatch) {
  // Watch mode - use context API for proper watch support
  (async () => {
    try {
      // Create contexts for each entry point
      const backgroundCtx = await esbuild.context({
        ...buildOptions,
        entryPoints: ['src/background/background.ts'],
        outfile: 'dist/background.js',
      });
      
      const popupCtx = await esbuild.context({
        ...buildOptions,
        entryPoints: ['src/popup/popup.ts'],
        outfile: 'dist/popup.js',
      });
      
      const fetchCtx = await esbuild.context({
        ...buildOptions,
        format: 'iife', // Override ESM format for content scripts
        entryPoints: ['src/popup/fetch.ts'],
        outfile: 'dist/fetch.js',
      });
      
      // Initial build
      await Promise.all([
        backgroundCtx.rebuild(),
        popupCtx.rebuild(),
        fetchCtx.rebuild(),
      ]);
      
      // Watch for changes
      await Promise.all([
        backgroundCtx.watch(),
        popupCtx.watch(),
        fetchCtx.watch(),
      ]);
      
      console.log('Watching for changes...');
    } catch (error) {
      console.error('Watch mode failed:', error);
      // Fallback to regular build
      build();
    }
  })();
} else {
  build();
}

