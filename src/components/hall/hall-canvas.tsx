"use client";

import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import {
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import {
  type Box,
  clampToHall,
  MIN_SIZE,
  normalizeRotation,
  snap,
} from "@/lib/hall/geometry";
import type { EditorItem } from "./hall-editor";

type HallSize = { width: number; height: number };

// Статус стола на рабочем экране и вторая строка подписи (таймер).
// off — на публичной странице: на выбранное время стол не забронировать;
// picked — место, которое выбрал гость.
export type ItemStatus = {
  tone: "free" | "busy" | "paused" | "off" | "picked";
  caption?: string;
};

type Palette = {
  bg: string;
  grid: string;
  resource: { fill: string; stroke: string; text: string };
  inactive: { fill: string; stroke: string; text: string };
  selected: string;
  status: Record<
    ItemStatus["tone"],
    { fill: string; stroke: string; text: string }
  >;
  objects: Record<
    string,
    { fill?: string; stroke?: string; dash?: number[]; text: string }
  >;
};

// Те же оттенки, что токены --status-* в globals.css: светлая тема —
// админка, тёмная — публичная страница.
const LIGHT: Palette = {
  bg: "#ffffff",
  grid: "#f0f0f2",
  resource: { fill: "#ffffff", stroke: "#66666e", text: "#151515" },
  inactive: { fill: "#f4f4f5", stroke: "#a2a3a5", text: "#66666e" },
  selected: "#151515",
  status: {
    free: { fill: "#e9f6ee", stroke: "#15803d", text: "#14532d" },
    busy: { fill: "#fdecee", stroke: "#e0182d", text: "#9f1239" },
    paused: { fill: "#fff4e0", stroke: "#b45309", text: "#78350f" },
    off: { fill: "#f4f4f5", stroke: "#d4d4da", text: "#9a9aa2" },
    picked: { fill: "#e0182d", stroke: "#b01f2d", text: "#ffffff" },
  },
  objects: {
    bar: { fill: "#fff4e0", stroke: "#b45309", text: "#78350f" },
    entrance: { fill: "#ebf1fb", stroke: "#3d6fc9", text: "#1e3a8a" },
    wall: { fill: "#3d3d3d", text: "#f5f5f5" },
    zone: { stroke: "#7c3aed", dash: [12, 8], text: "#5b21b6" },
    label: { text: "#151515" },
  },
};

const DARK: Palette = {
  bg: "#1b1b1b",
  grid: "#242424",
  resource: { fill: "#262626", stroke: "#5a5a5a", text: "#f5f5f5" },
  inactive: { fill: "#222222", stroke: "#3d3d3d", text: "#6b6b6b" },
  selected: "#ffffff",
  status: {
    free: { fill: "#15301f", stroke: "#34c46a", text: "#d1fadf" },
    busy: { fill: "#3a1b1f", stroke: "#ff5c69", text: "#ff9aa3" },
    paused: { fill: "#3a2a10", stroke: "#f5a524", text: "#f5d08a" },
    off: { fill: "#2a2a2a", stroke: "#3d3d3d", text: "#6b6b6b" },
    picked: { fill: "#e0182d", stroke: "#ff9aa3", text: "#ffffff" },
  },
  objects: {
    bar: { fill: "#3a2a10", stroke: "#f5a524", text: "#f5d08a" },
    entrance: { fill: "#1a2640", stroke: "#7aa2e8", text: "#cfe0ff" },
    wall: { fill: "#4a4a4a", text: "#f5f5f5" },
    zone: { stroke: "#a78bfa", dash: [12, 8], text: "#c4b5fd" },
    label: { text: "#f5f5f5" },
  },
};

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

// Холст Konva. Размер зала в условных единицах, холст масштабируется
// под ширину контейнера. Только для браузера: грузится через dynamic(ssr: false).
export default function HallCanvas({
  hall,
  items,
  selectedKey,
  editable,
  statuses,
  dark = false,
  onSelect,
  onChange,
}: {
  hall: HallSize;
  items: EditorItem[];
  selectedKey: string | null;
  editable: boolean;
  statuses?: Record<string, ItemStatus>;
  dark?: boolean;
  onSelect: (key: string | null) => void;
  onChange: (key: string, patch: Partial<Box & { rotation: number }>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const nodes = useRef(new Map<string, Konva.Group>());
  const transformer = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = selectedKey ? nodes.current.get(selectedKey) : undefined;
    transformer.current?.nodes(editable && node ? [node] : []);
    transformer.current?.getLayer()?.batchDraw();
  }, [selectedKey, items, editable]);

  const palette = dark ? DARK : LIGHT;
  const scale = width / hall.width;
  const gridLines = [];
  for (let x = 50; x < hall.width; x += 50) {
    gridLines.push(
      <Line
        key={`v${x}`}
        points={[x, 0, x, hall.height]}
        stroke={palette.grid}
      />,
    );
  }
  for (let y = 50; y < hall.height; y += 50) {
    gridLines.push(
      <Line
        key={`h${y}`}
        points={[0, y, hall.width, y]}
        stroke={palette.grid}
      />,
    );
  }

  function finishMove(item: EditorItem, node: Konva.Group) {
    const box = clampToHall(
      {
        x: snap(node.x() - item.w / 2),
        y: snap(node.y() - item.h / 2),
        w: item.w,
        h: item.h,
        rotation: item.rotation,
      },
      hall,
    );
    node.position({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    onChange(item.key, { x: box.x, y: box.y });
  }

  function finishTransform(item: EditorItem, node: Konva.Group) {
    const w = snap(Math.max(MIN_SIZE, item.w * node.scaleX()));
    const h = snap(Math.max(MIN_SIZE, item.h * node.scaleY()));
    node.scale({ x: 1, y: 1 });
    const rotation = normalizeRotation(node.rotation());
    const box = clampToHall(
      { x: snap(node.x() - w / 2), y: snap(node.y() - h / 2), w, h, rotation },
      hall,
    );
    onChange(item.key, { ...box, rotation });
  }

  return (
    <div
      ref={containerRef}
      // Размер задаёт обёртка редактора с пропорциями зала; холст её не растягивает.
      className="absolute inset-0"
      data-testid="hall-canvas"
    >
      {width > 0 && (
        <Stage
          width={width}
          height={hall.height * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === "bg") {
              onSelect(null);
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === "bg") {
              onSelect(null);
            }
          }}
        >
          <Layer>
            <Rect
              name="bg"
              width={hall.width}
              height={hall.height}
              fill={palette.bg}
            />
            {gridLines}
            {items.map((item) => (
              <Group
                key={item.key}
                ref={(node) => {
                  if (node) nodes.current.set(item.key, node);
                  else nodes.current.delete(item.key);
                }}
                x={item.x + item.w / 2}
                y={item.y + item.h / 2}
                offsetX={item.w / 2}
                offsetY={item.h / 2}
                rotation={item.rotation}
                draggable={editable}
                onMouseDown={() => onSelect(item.key)}
                onTap={() => onSelect(item.key)}
                onDragStart={() => onSelect(item.key)}
                onDragEnd={() => finishMove(item, nodes.current.get(item.key)!)}
                onTransformEnd={() =>
                  finishTransform(item, nodes.current.get(item.key)!)
                }
              >
                <ItemShape
                  item={item}
                  selected={item.key === selectedKey}
                  status={statuses?.[item.key]}
                  palette={palette}
                />
              </Group>
            ))}
            {editable && (
              <Transformer
                ref={transformer}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={8}
                keepRatio={false}
                flipEnabled={false}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < MIN_SIZE * scale ||
                  Math.abs(newBox.height) < MIN_SIZE * scale
                    ? oldBox
                    : newBox
                }
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function ItemShape({
  item,
  selected,
  status,
  palette,
}: {
  item: EditorItem;
  selected: boolean;
  status?: ItemStatus;
  palette: Palette;
}) {
  const { w, h } = item;
  let fill: string | undefined;
  let stroke: string | undefined;
  let dash: number[] | undefined;
  let textColor = palette.resource.text;
  let text: string;

  if (item.type === "resource") {
    ({
      fill,
      stroke,
      text: textColor,
    } = item.is_active ? palette.resource : palette.inactive);
    dash = item.is_active ? undefined : [10, 6];
    text = item.name;
    if (status) {
      ({ fill, stroke, text: textColor } = palette.status[status.tone]);
      if (status.caption) text = `${item.name}\n${status.caption}`;
    }
  } else {
    const style = palette.objects[item.kind];
    fill = style.fill;
    stroke = style.stroke;
    dash = style.dash;
    textColor = style.text;
    text = item.label ?? "";
  }
  if (selected) stroke = palette.selected;
  const strokeWidth = selected ? 4 : 2;
  const fontSize = Math.max(12, Math.min(24, Math.min(w, h) / 3));

  return (
    <>
      {item.type === "resource" && item.shape === "circle" ? (
        <Ellipse
          x={w / 2}
          y={h / 2}
          radiusX={w / 2}
          radiusY={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
        />
      ) : (
        <Rect
          width={w}
          height={h}
          cornerRadius={item.type === "resource" ? 10 : 2}
          fill={fill}
          stroke={stroke ?? (selected ? palette.selected : undefined)}
          strokeWidth={strokeWidth}
          dash={dash}
        />
      )}
      <Text
        width={w}
        height={h}
        text={text}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle={
          item.type === "resource" ||
          (item.type === "object" && item.kind === "label")
            ? "bold"
            : "normal"
        }
        fill={textColor}
        padding={4}
        listening={false}
      />
    </>
  );
}
