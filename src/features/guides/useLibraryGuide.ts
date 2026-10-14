import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Topic } from '@/src/data/schema';
import { LibraryGuideState, libraryGuideSteps } from './guide-registry';
import { GuideScrollAdapter, useScreenGuide } from './useScreenGuide';

export function useLibraryGuide(ready: boolean, ownerKey: string | null, state: LibraryGuideState) {
  // Let the nested navigator commit before consuming an initial URL replay request.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const search = useRef<View>(null);
  const filters = useRef<View>(null);
  const results = useRef<View>(null);
  const list = useRef<FlatList<Topic>>(null);
  const viewport = useRef<View>(null);
  const anchors = useMemo(() => ({ 'library.search': search, 'library.filters': filters, 'library.results': results }), []);
  const steps = useMemo(() => libraryGuideSteps(state), [state.hasTopics, state.hasResults, state.filtered, state.expanded]);
  const scrollAdapter = useMemo<GuideScrollAdapter>(() => ({
    measureNode: () => viewport.current,
    scrollTo: y => list.current?.scrollToOffset({ offset: y, animated: false }),
  }), []);
  const guide = useScreenGuide(ready && mounted, ownerKey, 'library', anchors, steps, scrollAdapter);
  return { ...guide, list, viewport };
}
