const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const generatedIcon = path.join(
  __dirname,
  'assets',
  'generated',
  'myelin-icon.png',
);

module.exports = ({ config }) => {
  if (!fs.existsSync(generatedIcon)) {
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'scripts', 'generate-icon.cjs')],
      { stdio: 'inherit' },
    );
  }

  return {
    ...config,
    icon: './assets/generated/myelin-icon.png',
    android: {
      ...config.android,
      icon: './assets/generated/myelin-icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/generated/myelin-icon.png',
        backgroundColor: '#070707',
      },
    },
  };
};
