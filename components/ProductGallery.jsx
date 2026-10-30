"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import SmartImage from "./SmartImage";

const MAX_VIEWER_SCALE = 4;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getTouchDistance(touches) {
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getTouchCenter(touches) {
  const first = touches[0];
  const second = touches[1];
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

export default function ProductGallery({ product }) {
  const images = useMemo(
    () => [...new Set([product.src, ...(product.galleryUrls || [])].filter(Boolean))],
    [product.galleryUrls, product.src],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTransform, setViewerTransform] = useState({ scale: 1, x: 0, y: 0 });
  const touchStartX = useRef(null);
  const touchSwiped = useRef(false);
  const viewerGesture = useRef(null);
  const selectedImage = images[selectedIndex] || "";

  useEffect(() => {
    setSelectedIndex(0);
    setZoomed(false);
    setViewerOpen(false);
    setViewerTransform({ scale: 1, x: 0, y: 0 });
    viewerGesture.current = null;
  }, [images]);

  useEffect(() => {
    if (!viewerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") setViewerOpen(false);
      if (event.key === "ArrowLeft" && images.length > 1) showPreviousImage();
      if (event.key === "ArrowRight" && images.length > 1) showNextImage();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, selectedIndex, viewerOpen]);

  function selectImage(index) {
    setSelectedIndex(index);
    setZoomed(false);
    setViewerTransform({ scale: 1, x: 0, y: 0 });
  }

  function showPreviousImage() {
    selectImage((selectedIndex - 1 + images.length) % images.length);
  }

  function showNextImage() {
    selectImage((selectedIndex + 1) % images.length);
  }

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchSwiped.current = false;
  }

  function handleTouchEnd(event) {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < 40 || images.length < 2) return;
    touchSwiped.current = true;
    if (endX < startX) showNextImage();
    else showPreviousImage();
  }

  function handleMainImageClick() {
    if (touchSwiped.current) {
      touchSwiped.current = false;
      return;
    }
    openViewer();
  }

  function openViewer() {
    viewerGesture.current = null;
    setViewerTransform({ scale: 1, x: 0, y: 0 });
    setViewerOpen(true);
  }

  function updateZoomPosition(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setZoomPosition({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    });
  }

  function handleViewerTouchStart(event) {
    if (event.touches.length === 2) {
      viewerGesture.current = {
        mode: "pinch",
        startDistance: getTouchDistance(event.touches),
        startScale: viewerTransform.scale,
        startX: viewerTransform.x,
        startY: viewerTransform.y,
        startCenter: getTouchCenter(event.touches),
      };
      return;
    }

    if (event.touches.length === 1) {
      viewerGesture.current = {
        mode: viewerTransform.scale > 1 ? "pan" : "swipe",
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        originX: viewerTransform.x,
        originY: viewerTransform.y,
      };
    }
  }

  function handleViewerTouchMove(event) {
    const gesture = viewerGesture.current;
    if (!gesture) return;

    event.preventDefault();

    if (event.touches.length === 2 && gesture.mode === "pinch") {
      const scale = clamp(
        gesture.startScale * (getTouchDistance(event.touches) / gesture.startDistance),
        1,
        MAX_VIEWER_SCALE,
      );
      const center = getTouchCenter(event.touches);
      const centerDeltaX = center.x - gesture.startCenter.x;
      const centerDeltaY = center.y - gesture.startCenter.y;
      setViewerTransform({
        scale,
        x: gesture.startX + centerDeltaX,
        y: gesture.startY + centerDeltaY,
      });
      return;
    }

    if (event.touches.length === 1 && gesture.mode === "pan" && viewerTransform.scale > 1) {
      const scale = viewerTransform.scale;
      const maxX = (window.innerWidth * (scale - 1)) / 2;
      const maxY = (window.innerHeight * (scale - 1)) / 2;
      const nextX = gesture.originX + event.touches[0].clientX - gesture.startX;
      const nextY = gesture.originY + event.touches[0].clientY - gesture.startY;
      setViewerTransform({
        scale,
        x: clamp(nextX, -maxX, maxX),
        y: clamp(nextY, -maxY, maxY),
      });
    }
  }

  function handleViewerTouchEnd(event) {
    const gesture = viewerGesture.current;

    if (gesture?.mode === "swipe") {
      const endX = event.changedTouches[0]?.clientX;
      if (endX !== undefined && images.length > 1 && Math.abs(endX - gesture.startX) >= 40) {
        if (endX < gesture.startX) showNextImage();
        else showPreviousImage();
      }
      viewerGesture.current = null;
      return;
    }

    if (event.touches.length === 1 && viewerTransform.scale > 1) {
      viewerGesture.current = {
        mode: "pan",
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        originX: viewerTransform.x,
        originY: viewerTransform.y,
      };
      return;
    }

    viewerGesture.current = null;
    if (viewerTransform.scale <= 1) setViewerTransform({ scale: 1, x: 0, y: 0 });
  }

  function closeViewer() {
    viewerGesture.current = null;
    setViewerOpen(false);
    setViewerTransform({ scale: 1, x: 0, y: 0 });
  }

  return (
    <div className="-mx-4 grid items-start gap-4 sm:mx-0 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-5">
      <div className="order-2 flex max-w-full gap-3 overflow-x-auto px-4 pb-1 sm:max-h-[760px] sm:flex-col sm:overflow-y-auto sm:px-0 sm:pr-2">
        {images.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => selectImage(index)}
            aria-label={`View product image ${index + 1}`}
            aria-pressed={selectedImage === image}
            className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-white transition duration-300 sm:h-24 sm:w-24 ${selectedImage === image ? "border-gold shadow-[0_8px_22px_-10px_rgba(201,154,75,0.9)]" : "border-transparent hover:border-gold/50"}`}
          >
            <SmartImage src={image} alt="" tone={product.tone} className="h-full w-full" imgClassName="h-full w-full object-contain" />
          </button>
        ))}
      </div>

      <div
        className={`order-1 relative sm:order-2 sm:rounded-[24px] ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={updateZoomPosition}
        onClick={handleMainImageClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-full overflow-hidden bg-white sm:aspect-square sm:rounded-[28px] sm:border sm:border-gold/20 sm:shadow-[0_28px_70px_-35px_rgba(21,16,12,0.55)]">
          <div className="flex w-full transition-transform duration-500 ease-out sm:h-full" style={{ transform: `translateX(-${selectedIndex * 100}%)` }}>
            {images.map((image, index) => (
              <SmartImage
                key={image}
                src={image}
                alt={index === selectedIndex ? product.name : ""}
                tone={product.tone}
                className="w-full shrink-0 sm:h-full"
                style={{ "--zoom-x": `${zoomPosition.x}%`, "--zoom-y": `${zoomPosition.y}%` }}
                imgClassName={`h-auto w-full object-contain transition-transform duration-300 [transform-origin:var(--zoom-x)_var(--zoom-y)] sm:h-full ${index === selectedIndex && zoomed ? "scale-[1.8]" : "scale-100"}`}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            ))}
          </div>
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none mt-4 flex items-center justify-center gap-1.5 sm:absolute sm:bottom-4 sm:left-1/2 sm:mt-0 sm:-translate-x-1/2 sm:rounded-full sm:bg-ink/85 sm:px-3 sm:py-2 sm:shadow-[0_8px_20px_-8px_rgba(21,16,12,0.8)] sm:ring-1 sm:ring-gold/50 sm:backdrop-blur-sm" aria-label={`Product image ${selectedIndex + 1} of ${images.length}`}>
            {images.map((image, index) => <span key={image} className={`h-2 w-2 rounded-full transition-colors ${index === selectedIndex ? "bg-ink sm:bg-gradient-to-b sm:from-gold-light sm:to-gold" : "bg-stone-300 sm:bg-gold/45"}`} />)}
          </div>
        )}
      </div>

      {viewerOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] isolate flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-white p-0 sm:bg-[#050505] sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} image viewer`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <button
            type="button"
            onClick={closeViewer}
            aria-label="Close image viewer"
            className="absolute left-4 top-6 z-10 flex h-11 w-11 items-center justify-center text-stone-400 transition hover:text-ink sm:left-auto sm:right-4 sm:top-4 sm:rounded-full sm:bg-white/10 sm:text-white sm:ring-1 sm:ring-white/30 sm:backdrop-blur-sm sm:hover:bg-white/20 sm:hover:text-white"
          >
            <X size={23} />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPreviousImage}
                aria-label="View previous product image"
                className="absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/20 sm:flex"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={showNextImage}
                aria-label="View next product image"
                className="absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/20 sm:flex"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <div
            className="flex h-full w-full items-start justify-center overflow-hidden px-0 pb-24 pt-20 touch-none sm:items-center sm:p-4"
            onTouchStart={handleViewerTouchStart}
            onTouchMove={handleViewerTouchMove}
            onTouchEnd={handleViewerTouchEnd}
          >
            <SmartImage
              src={selectedImage}
              alt={product.name}
              tone="from-transparent to-transparent"
              className="!w-full !max-h-[calc(100dvh-140px)] !max-w-full !overflow-visible !bg-transparent sm:!h-auto sm:!w-auto sm:!max-h-[88dvh] sm:!max-w-[96vw]"
              style={{
                transform: `translate3d(${viewerTransform.x}px, ${viewerTransform.y}px, 0) scale(${viewerTransform.scale})`,
                transformOrigin: "center center",
                transition: viewerGesture.current ? "none" : "transform 160ms ease-out",
              }}
              imgClassName="block h-auto max-h-[calc(100dvh-140px)] w-full max-w-full object-contain sm:h-auto sm:w-auto sm:max-h-[88dvh] sm:max-w-[96vw]"
              loading="eager"
              fetchPriority="high"
            />
          </div>

          <div className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5" aria-label={`Product image ${selectedIndex + 1} of ${images.length}`}>
            {images.map((image, index) => <span key={image} className={`h-2 w-2 rounded-full transition-colors ${index === selectedIndex ? "bg-ink sm:bg-white" : "bg-stone-300 sm:bg-white/35"}`} />)}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
