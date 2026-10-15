export type AnnotationType =
  | 'text'
  | 'shape'
  | 'draw'
  | 'signature'
  | 'image'
  | 'stamp'
  | 'watermark'
  | 'redact'
  | 'sticky';

export type ShapeType =
  | 'rect'
  | 'rounded-rect'
  | 'circle'
  | 'line'
  | 'check'
  | 'cross'
  | 'arrow';

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bgWhiteout?: boolean;
  customBgColor?: string;
  shapeType?: ShapeType;
  strokeWidth?: number;
  opacity?: number;
  points?: Point[];
  lineWidth?: number;
  src?: string;
  rotation?: number;
  underText?: boolean;
  zIndex?: number | string;
  stickyExpanded?: boolean;
  author?: string;
  noteColor?: string;
  exportAsPdfAnnotation?: boolean;
}

export type AnnotationsMap = Record<number, Annotation[]>;
export type PageRotationsMap = Record<number, number>;

export interface PageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  croppedSrc: string;
  newWidth?: number;
  newHeight?: number;
}

export type PageCropsMap = Record<number, PageCrop>;

export interface EditorSnapshot {
  annotations: AnnotationsMap;
  rotations: PageRotationsMap;
  crops: PageCropsMap;
}

export interface TextInspectionResult {
  text: string;
  fontSize: number;
  fontFamily?: string;
  bgColor: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
