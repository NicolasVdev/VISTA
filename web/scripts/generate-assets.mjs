import sharp from "sharp";

const icon = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.23)}" fill="#1e6b4f"/>
    <path d="M ${size * 0.23} ${size * 0.23} L ${size * 0.46} ${size * 0.76} L ${size * 0.77} ${size * 0.23} H ${size * 0.61} L ${size * 0.47} ${size * 0.57} L ${size * 0.34} ${size * 0.23} Z" fill="#fffef9"/>
    <circle cx="${size * 0.76}" cy="${size * 0.75}" r="${size * 0.065}" fill="#d9b765"/>
  </svg>`;

await sharp(Buffer.from(icon(192))).png().toFile("public/icon-192.png");
await sharp(Buffer.from(icon(512))).png().toFile("public/icon-512.png");
await sharp(Buffer.from(icon(180))).png().toFile("public/apple-touch-icon.png");
