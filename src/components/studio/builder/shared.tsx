"use client";

import { useState, type ReactNode } from "react";
import type { ProvenanceDossier } from "@verifact/core";
import { Label, TextInput } from "../ui";

export interface TabProps {
  dossier: ProvenanceDossier;
  onChange: (next: ProvenanceDossier) => void;
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">{children}</div>;
}

export function Labeled({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

/** Optional text: empty means "unset". Keeps raw text while typing. */
export function OptionalText({ value, onChange, placeholder, label, mono }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; label: string; mono?: boolean }) {
  const external = value ?? "";
  const [text, setText] = useState(external);
  const [last, setLast] = useState(external);
  if (external !== last) {
    setLast(external);
    setText(external);
  }
  return (
    <TextInput
      aria-label={label}
      value={text}
      placeholder={placeholder}
      className={mono ? "font-mono text-xs" : undefined}
      onChange={(e) => {
        setText(e.target.value);
        setLast(e.target.value);
        onChange(e.target.value === "" ? undefined : e.target.value);
      }}
    />
  );
}

/** Optional number: empty text means "unset". */
export function OptionalNumber({ value, onChange, placeholder, label }: { value: number | undefined; onChange: (n: number | undefined) => void; placeholder?: string; label: string }) {
  const external = value === undefined ? "" : String(value);
  const [text, setText] = useState(external);
  const [last, setLast] = useState(external);
  if (external !== last) {
    setLast(external);
    setText(external);
  }
  return (
    <TextInput
      type="number"
      step="any"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === "" ? undefined : Number(e.target.value);
        if (n === undefined || Number.isFinite(n)) {
          setLast(n === undefined ? "" : String(n));
          onChange(n);
        }
      }}
    />
  );
}
