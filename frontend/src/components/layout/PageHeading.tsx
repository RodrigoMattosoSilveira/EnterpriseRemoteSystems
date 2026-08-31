import type { ReactNode } from "react";

type HeadingProps = {
  children: ReactNode;
  className?: string;
};

export function PageTitle({ children, className = "" }: HeadingProps) {
  return (
    <h1 className={`text-3xl font-bold text-gray-950${className ? ` ${className}` : ""}`}>
      {children}
    </h1>
  );
}

export function PageContextHeading({ children, className = "" }: HeadingProps) {
  return (
    <h2 className={`mt-1 text-lg font-semibold text-gray-800${className ? ` ${className}` : ""}`}>
      {children}
    </h2>
  );
}
