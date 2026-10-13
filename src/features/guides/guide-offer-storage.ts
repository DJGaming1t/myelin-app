import AsyncStorage from '@react-native-async-storage/async-storage';
import { createGuideOfferStorage } from './guide-offer-state';

export const guideOfferStorage = createGuideOfferStorage(AsyncStorage);
