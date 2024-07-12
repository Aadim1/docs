import remarkCodeImport from 'remark-code-import';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import createMDX from '@next/mdx';
import rehypeMdxCodeProps from 'rehype-mdx-code-props';
import checkSnippetName from './plugins/check-snippet-name.mjs';

const require = createRequire(import.meta.url);
import rehypeImgSize from 'rehype-img-size';

import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import path from 'path';

dotenv.config({ path: './.env.custom' });

const pagesDirectory = path.resolve(process.cwd());
console.log('Page', pagesDirectory);

const nextJSConfig = () => {
  const withMDX = createMDX({
    extension: /\.mdx$/,
    options: {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        checkSnippetName,
        [rehypeImgSize, { dir: 'public' }],
        rehypeMdxCodeProps,
        rehypeSlug
      ]
    }
  });

  const shouldAnalyzeBundles = process.env.ANALYZE === 'true';

  let nextConfig = withMDX({
    webpack: (config) => {
      config.module.rules.push({
        test: /\.(ts|tsx|js|jsx)$/,
        include: [path.resolve(process.cwd(), '/codesnippets/src')],
        type: 'asset/source'
      });
      return config;
    },
    output: 'export',
    distDir: 'client/www/next-build',
    generateBuildId: async () => {
      return 'amplify-docs';
    },
    env: {
      BUILD_ENV: process.env.BUILD_ENV,
      ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
      ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY,
      ALGOLIA_INDEX_NAME: process.env.ALGOLIA_INDEX_NAME,
      nextImageExportOptimizer_imageFolderPath: 'public',
      nextImageExportOptimizer_exportFolderPath: 'out',
      nextImageExportOptimizer_quality: '75',
      nextImageExportOptimizer_storePicturesInWEBP: 'true',
      nextImageExportOptimizer_exportFolderName: 'nextImageExportOptimizer',

      // If you do not want to use blurry placeholder images, then you can set
      // nextImageExportOptimizer_generateAndUseBlurImages to false and pass
      // `placeholder="empty"` to all <ExportedImage> components.
      nextImageExportOptimizer_generateAndUseBlurImages: 'true'
    },
    images: {
      loader: 'custom',
      imageSizes: [],
      deviceSizes: [450, 1920]
    },
    pageExtensions: ['js', 'jsx', 'mdx', 'tsx', 'ts'],
    typescript: {
      // !! WARN !!
      // Dangerously allow production builds to successfully complete even if
      // your project has type errors.
      // !! WARN !!
      ignoreBuildErrors: true
    },
    trailingSlash: true,
    transpilePackages: [
      '@algolia/autocomplete-shared',
      'next-image-export-optimizer'
    ]
  });

  if (shouldAnalyzeBundles) {
    const withNextBundleAnalyzer = require('next-bundle-analyzer')({
      format: ['json'],
      reportDir: '../.github/analyze',
      json: {
        filter: {
          pages: true
        }
      }
    });
    nextConfig = withNextBundleAnalyzer(nextConfig);
  }

  return nextConfig;
};

export default nextJSConfig;
