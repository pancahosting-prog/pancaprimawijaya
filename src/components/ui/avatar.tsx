import * as React from "react";
import { cn } from "../../lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback: string;
}

const Avatar: React.FC<AvatarProps> = ({ src, alt, fallback, className, ...props }) => {
  const [imageError, setImageError] = React.useState(!src);

  return (
    <div
      className={cn(
        "relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-zinc-200/80 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800",
        className
      )}
      {...props}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={alt || "Avatar"}
          onError={() => setImageError(true)}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 uppercase">
          {fallback}
        </div>
      )}
    </div>
  );
};

export { Avatar };
