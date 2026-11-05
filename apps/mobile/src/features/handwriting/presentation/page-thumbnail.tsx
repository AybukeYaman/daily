import type { HandwritingBlock } from '@daily/shared';
import { Canvas, Group, Picture } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HandwritingSession } from '../application/handwriting-session';
import { paper } from '../../../design-system/theme';
import { PictureCache } from './picture-cache';

/** Visible part of a page in the editor: the top, at most this tall relative to its width. */
const MAX_ASPECT = 0.75;

/** Static preview of a handwriting page inside the text editor. Decoded once per page version. */
export const PageThumbnail = memo(function PageThumbnail({ page }: { page: HandwritingBlock }) {
  const [width, setWidth] = useState(0);
  const picture = useMemo(() => {
    try {
      return new PictureCache().rebuild(HandwritingSession.deserialize(page.strokes));
    } catch {
      return null; // corrupt data never crashes the editor; the page screen reports it
    }
  }, [page.strokes]);

  const scale = width > 0 ? width / page.width : 0;
  const height = width * MAX_ASPECT;

  return (
    <View style={[styles.frame, { height: height || 120, backgroundColor: paper.background }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {picture && scale > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ scale }]}>
            <Picture picture={picture} />
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 10 },
});
