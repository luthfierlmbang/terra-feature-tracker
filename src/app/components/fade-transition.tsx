import React, { useState, useEffect } from "react";

export function FadeTransition({
  show,
  children,
  className = "",
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [render, setRender] = useState(show);

  useEffect(() => {
    if (show) setRender(true);
  }, [show]);

  const handleAnimationEnd = () => {
    if (!show) setRender(false);
  };

  if (!render) return null;

  return (
    <div
      style={{
        animation: `${show ? "fadeIn" : "fadeOut"} 0.2s ease-out forwards`,
      }}
      className={className}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}

export function SlideUpTransition({
  show,
  children,
  className = "",
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [render, setRender] = useState(show);

  useEffect(() => {
    if (show) setRender(true);
  }, [show]);

  const handleAnimationEnd = () => {
    if (!show) setRender(false);
  };

  if (!render) return null;

  return (
    <div
      style={{
        animation: `${show ? "slideUpFade" : "slideDownFade"} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
      }}
      className={className}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}
