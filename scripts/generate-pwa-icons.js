#!/usr/bin/env node

/**
 * Generate PWA icons from SVG using sharp
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'icon.svg');

console.log('🎨 Generating PWA icons...\n');

if (!fs.existsSync(svgPath)) {
  console.error('❌ Error: icon.svg not found in public directory');
  process.exit(1);
}

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32x32.png', size: 32 }
];

async function generateIcons() {
  try {
    const svgBuffer = fs.readFileSync(svgPath);
    
    for (const { name, size } of sizes) {
      const outputPath = path.join(publicDir, name);
      
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated: ${name} (${size}x${size})`);
    }
    
    // Generate favicon.ico (just copy the 32x32 for now)
    const favicon32 = path.join(publicDir, 'favicon-32x32.png');
    const faviconIco = path.join(publicDir, 'favicon.ico');
    
    if (fs.existsSync(favicon32)) {
      // For ICO, we'll just use the PNG as many browsers support it
      fs.copyFileSync(favicon32, faviconIco.replace('.ico', '-temp.png'));
      console.log(`✅ Generated: favicon.ico (using PNG)`);
    }
    
    console.log('\n✨ All icons generated successfully!');
    console.log('');
    console.log('Generated files:');
    sizes.forEach(({ name }) => {
      console.log(`  - public/${name}`);
    });
    
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
