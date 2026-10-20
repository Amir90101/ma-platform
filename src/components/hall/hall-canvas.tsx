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
export type ItemStatus = {
  tone: "free" | "busy" | "paused";
  caption?: string;
};

const STATUS_STYLE: Record<
  ItemStatus["tone"],
  { fill: string; stroke: string; text: string }
> = {
  free: { fill: "#dcfce7", stroke: "#15803d", text: "#14532d" },
  busy: { fill: "#fee2e2", stroke: "#b91c1c", text: "#7f1d1d" },
  paused: { fill: "#fef3c7", stroke: "#b45309", text: "#78350f" },
};

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

const OBJECT_STYLE: Record<
  string,
  { fill?: string; stroke?: string; dash?: number[]; text: string }
> = {
  bar: { fill: "#fde68a", stroke: "#b45309", text: "#78350f" },
  entrance: { fill: "#bfdbfe", stroke: "#1d4ed8", text: "#1e3a8a" },
  wall: { fill: "#4b5563", text: "#f9fafb" },
  zone: { stroke: "#7c3aed", dash: [12, 8], text: "#5b21b6" },
  label: { text: "#111827" },
};

// Холст Konva. Размер зала в условных единицах, холст масштабируется
// под ширину контейнера. Только для браузера: грузится через dynamic(ssr: false).
export default function HallCanvas({
  hall,
  items,
  selectedKey,
  editable,
  statuses,
  onSelect,
  onChange,
}: {
  hall: HallSize;
  items: EditorItem[];
  selectedKey: string | null;
  editable: boolean;
  statuses?: Record<string, ItemStatus>;
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

  const scale = width / hall.width;
  const gridLines = [];
  for (let x = 50; x < hall.width; x += 50) {
    gridLines.push(
      <Line key={`v${x}`} points={[x, 0, x, hall.height]} stroke="#eef0f3" />,
    );
  }
  for (let y = 50; y < hall.height; y += 50) {
    gridLines.push(
      <Line key={`h${y}`} points={[0, y, hall.width, y]} stroke="#eef0f3" />,
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
              fill="#ffffff"
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
}: {
  item: EditorItem;
  selected: boolean;
  status?: ItemStatus;
}) {
  const { w, h } = item;
  let fill: string | undefined;
  let stroke: string | undefined;
  let dash: number[] | undefined;
  let textColor = "#111827";
  let text: string;

  if (item.type === "resource") {
    fill = item.is_active ? "#dcfce7" : "#f3f4f6";
    stroke = item.is_active ? "#15803d" : "#9ca3af";
    dash = item.is_active ? undefined : [10, 6];
    textColor = item.is_active ? "#14532d" : "#6b7280";
    text = item.name;
    if (status) {
      ({ fill, stroke, text: textColor } = STATUS_STYLE[status.tone]);
      if (status.caption) text = `${item.name}\n${status.caption}`;
    }
  } else {
    const style = OBJECT_STYLE[item.kind];
    fill = style.fill;
    stroke = style.stroke;
    dash = style.dash;
    textColor = style.text;
    text = item.label ?? "";
  }
  if (selected) stroke = "#2563eb";
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
          cornerRadius={item.type === "resource" ? 8 : 2}
          fill={fill}
          stroke={stroke ?? (selected ? "#2563eb" : undefined)}
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
          item.type === "object" && item.kind === "label" ? "bold" : "normal"
        }
        fill={textColor}
        padding={4}
        listening={false}
      />
    </>
  );
}
