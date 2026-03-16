/**
 * Type declarations for feather-icons
 * https://github.com/feathericons/feather
 */

declare module 'feather-icons' {
  export interface FeatherIcon {
    name: string;
    contents: string;
    tags: string[];
    attrs: {
      class?: string;
      xmlns?: string;
      width?: number | string;
      height?: number | string;
      viewBox?: string;
      fill?: string;
      stroke?: string;
      'stroke-width'?: number | string;
      'stroke-linecap'?: string;
      'stroke-linejoin'?: string;
    };
    toSvg: (attrs?: Record<string, string | number>) => string;
  }

  export interface FeatherIcons {
    [key: string]: FeatherIcon;
  }

  const feather: {
    icons: FeatherIcons;
    replace: (options?: { 'class'?: string; 'stroke-width'?: number }) => void;
    toSvg: (name: string, attrs?: Record<string, string | number>) => string;
  };

  export default feather;
}
