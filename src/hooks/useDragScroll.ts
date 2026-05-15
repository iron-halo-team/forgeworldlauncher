import { useEffect, useRef } from 'react';

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    let isDragging = false;
    let startX = 0;
    let initialScroll = 0;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest('button, a, input, textarea, select, label')) {
        return;
      }

      isDragging = true;
      startX = event.clientX;
      initialScroll = node.scrollLeft;
      node.setPointerCapture(event.pointerId);
      node.classList.add('is-dragging');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      const offset = event.clientX - startX;
      node.scrollLeft = initialScroll - offset;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      node.releasePointerCapture(event.pointerId);
      node.classList.remove('is-dragging');
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        node.scrollLeft += event.deltaY;
      }
    };

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointerleave', onPointerUp);
    node.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointerleave', onPointerUp);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  return ref;
}
