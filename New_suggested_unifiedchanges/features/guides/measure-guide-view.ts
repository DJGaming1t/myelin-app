import { View } from 'react-native';
import { GuideRect } from './guide-geometry';

export const measureGuideView = (node: Pick<View, 'measureInWindow'> | null): Promise<GuideRect | null> => new Promise(resolve => {
  if (!node) { resolve(null); return; }
  // A removed native view may never call its measurement callback.
  const timeout = setTimeout(() => resolve(null), 500);
  node.measureInWindow((x, y, width, height) => {
    clearTimeout(timeout);
    resolve({ x, y, width, height });
  });
});
