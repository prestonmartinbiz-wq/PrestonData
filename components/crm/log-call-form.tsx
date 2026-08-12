"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { outcomeLabel } from "@/lib/calls";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  CALLBACK_OUTCOMES,
  CALL_OUTCOMES,
  MAX_CALL_AUDIO_BYTES,
  type CallRecord,
  type Lead,
} from "@/lib/types";

function toDatetimeLocalValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function transcriptBadge(status: string) {
  switch (status) {
    case "ready":
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
          Transcript ready
        </Badge>
      );
    case "pending":
      return (
        <Badge className="border-amber-200 bg-amber-50 text-amber-800">
          Transcribing…
        </Badge>
      );
    case "failed":
      return (
        <Badge className="border-rose-200 bg-rose-50 text-rose-800">
          Transcript failed
        </Badge>
      );
    case "skipped":
      return (
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
          Transcription needs OPENAI_API_KEY
        </Badge>
      );
    default:
      return null;
  }
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LogCallForm({
  lead,
  currentUserEmail,
  currentUserName,
  recentCalls,
  onLogged,
  onCancel,
}: {
  lead: Lead;
  currentUserEmail?: string;
  currentUserName?: string;
  recentCalls: CallRecord[];
  onLogged: (payload: {
    call: CallRecord;
    leads?: Lead[];
    calls: CallRecord[];
  }) => void;
  onCancel?: () => void;
}) {
  const defaultCaller = currentUserName || currentUserEmail || "";
  const [outcome, setOutcome] = useState<string>("no_answer");
  const [calledAt, setCalledAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [callbackAt, setCallbackAt] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneUsed, setPhoneUsed] = useState(lead.phone || lead.altPhone || "");
  const [contactName, setContactName] = useState(lead.decisionMaker || "");
  const [caller, setCaller] = useState(defaultCaller);
  const [durationSec, setDurationSec] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "transcribing">("idle");
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  const [transcriptEditId, setTranscriptEditId] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const showCallback = CALLBACK_OUTCOMES.has(outcome) || outcome === "callback_set";
  const accept = ALLOWED_AUDIO_EXTENSIONS.join(",");
  const busy = phase !== "idle";

  const history = useMemo(
    () =>
      [...recentCalls]
        .filter((c) => c.apn === lead.apn || !lead.apn)
        .sort((a, b) => (Date.parse(b.calledAt) || 0) - (Date.parse(a.calledAt) || 0))
        .slice(0, 8),
    [recentCalls, lead.apn]
  );

  function onPickAudio(file: File | null) {
    if (!file) {
      setAudioFile(null);
      return;
    }
    if (file.size > MAX_CALL_AUDIO_BYTES) {
      toast.error(
        `Audio exceeds ${Math.round(MAX_CALL_AUDIO_BYTES / (1024 * 1024))}MB limit`
      );
      if (fileRef.current) fileRef.current.value = "";
      setAudioFile(null);
      return;
    }
    setAudioFile(file);
  }

  async function submit() {
    if (!outcome) {
      toast.error("Outcome is required");
      return;
    }
    if (outcome === "callback_set" && !callbackAt) {
      toast.error("Callback time is required for Callback set");
      return;
    }
    setPhase("saving");
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: {
            apn: lead.apn,
            outcome,
            calledAt: fromDatetimeLocalValue(calledAt) || new Date().toISOString(),
            callbackAt: fromDatetimeLocalValue(callbackAt),
            notes,
            phoneUsed,
            contactName,
            caller: caller || defaultCaller,
            durationSec: durationSec.trim(),
            source: "crm_ui",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log call");

      let call: CallRecord = data.call;
      let calls: CallRecord[] = data.calls;
      const leads: Lead[] = data.leads;

      if (audioFile) {
        setPhase("uploading");
        const form = new FormData();
        form.append("file", audioFile);
        setPhase("transcribing");
        const audioRes = await fetch(
          `/api/calls/${encodeURIComponent(call.callId)}/audio`,
          { method: "POST", body: form }
        );
        const audioData = await audioRes.json();
        if (!audioRes.ok) {
          toast.error(audioData.error || "Call saved, but audio upload failed");
        } else {
          call = audioData.call;
          calls = audioData.calls;
          if (audioData.transcriptNote) {
            toast.message(audioData.transcriptNote);
          } else if (call.transcriptStatus === "ready") {
            toast.success("Call logged with transcript");
          } else {
            toast.success("Call logged with audio");
          }
        }
      } else {
        toast.success("Call logged");
      }

      if (transcriptText.trim()) {
        const result = await postTranscript(call.callId, transcriptText);
        if (result) {
          call = result.call;
          calls = result.calls;
          toast.success("Transcript saved");
        }
      }

      onLogged({ call, leads, calls });
      setAudioFile(null);
      setTranscriptText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log call");
    } finally {
      setPhase("idle");
    }
  }

  async function postTranscript(
    callId: string,
    text: string
  ): Promise<{ call: CallRecord; calls: CallRecord[] } | null> {
    const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Transcript save failed");
      return null;
    }
    return { call: data.call, calls: data.calls };
  }

  async function saveTranscriptForExisting(callId: string) {
    if (!transcriptDraft.trim()) {
      toast.error("Paste transcript text first");
      return;
    }
    setPhase("saving");
    try {
      const result = await postTranscript(callId, transcriptDraft);
      if (result) {
        toast.success("Transcript saved");
        setTranscriptEditId(null);
        setTranscriptDraft("");
        onLogged({ call: result.call, calls: result.calls });
      }
    } finally {
      setPhase("idle");
    }
  }

  async function attachToExisting(callId: string, file: File) {
    if (file.size > MAX_CALL_AUDIO_BYTES) {
      toast.error(
        `Audio exceeds ${Math.round(MAX_CALL_AUDIO_BYTES / (1024 * 1024))}MB limit`
      );
      return;
    }
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      setPhase("transcribing");
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/audio`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audio upload failed");
      if (data.transcriptNote) toast.message(data.transcriptNote);
      else if (data.call?.transcriptStatus === "ready") toast.success("Transcript ready");
      else toast.success("Audio attached");
      onLogged({
        call: data.call,
        calls: data.calls,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audio upload failed");
    } finally {
      setPhase("idle");
    }
  }

  const phaseLabel =
    phase === "saving"
      ? "Saving call..."
      : phase === "uploading"
        ? "Uploading audio..."
        : phase === "transcribing"
          ? "Transcribing..."
          : "Save call";

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Outcome</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger>
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              {CALL_OUTCOMES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="calledAt">Called at</Label>
            <Input
              id="calledAt"
              type="datetime-local"
              value={calledAt}
              onChange={(e) => setCalledAt(e.target.value)}
            />
          </div>
          {showCallback ? (
            <div className="space-y-1.5">
              <Label htmlFor="callbackAt">
                Callback at{outcome === "callback_set" ? " *" : ""}
              </Label>
              <Input
                id="callbackAt"
                type="datetime-local"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
                required={outcome === "callback_set"}
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="contactName">Contact name</Label>
            <Input
              id="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Decision maker"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phoneUsed">Phone used</Label>
            <Input
              id="phoneUsed"
              value={phoneUsed}
              onChange={(e) => setPhoneUsed(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="caller">Caller</Label>
            <Input
              id="caller"
              value={caller}
              onChange={(e) => setCaller(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="durationSec">Duration (sec)</Label>
            <Input
              id="durationSec"
              type="number"
              min={0}
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="callNotes">Notes</Label>
          <Textarea
            id="callNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened on the call..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="callAudio">Recording (optional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileRef}
              id="callAudio"
              type="file"
              accept={accept}
              className="cursor-pointer"
              onChange={(e) => onPickAudio(e.target.files?.[0] || null)}
              disabled={busy}
            />
          </div>
          <p className="text-xs text-slate-500">
            mp3, m4a, mp4, wav, webm, ogg · max{" "}
            {Math.round(MAX_CALL_AUDIO_BYTES / (1024 * 1024))}MB. Transcribed with
            Whisper when OPENAI_API_KEY is set.
          </p>
          {audioFile ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Mic className="h-3.5 w-3.5" />
              <span className="truncate">{audioFile.name}</span>
              <span className="text-slate-400">({formatBytes(audioFile.size)})</span>
              <button
                type="button"
                className="text-slate-500 underline"
                onClick={() => {
                  setAudioFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="callTranscript">Transcript (optional)</Label>
          <Textarea
            id="callTranscript"
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste the call transcript here, or upload a .txt file below…"
            rows={3}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <label className="inline-flex cursor-pointer items-center gap-1 text-slate-600 underline">
              <Upload className="h-3 w-3" /> Upload .txt
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setTranscriptText(await f.text());
                  e.target.value = "";
                }}
              />
            </label>
            <span>
              Attach a transcript directly (no audio needed). Works even without
              OPENAI_API_KEY.
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" onClick={submit} disabled={busy}>
          {phaseLabel}
        </Button>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-medium text-slate-900">Recent calls</h3>
        {history.length ? (
          <ul className="space-y-2">
            {history.map((c) => (
              <li
                key={c.callId}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {outcomeLabel(c.outcome)}
                  </span>
                  <span className="text-slate-500">{formatWhen(c.calledAt)}</span>
                </div>
                {c.callbackAt ? (
                  <div className="mt-0.5 text-slate-500">
                    Callback: {formatWhen(c.callbackAt)}
                  </div>
                ) : null}
                {c.notes ? <div className="mt-1 line-clamp-2">{c.notes}</div> : null}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {c.audioUrl ? (
                    <a
                      href={c.audioUrl}
                      className="text-slate-600 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Play audio
                    </a>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1 text-slate-600 underline">
                      <Upload className="h-3 w-3" />
                      Attach audio
                      <input
                        type="file"
                        accept={accept}
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void attachToExisting(c.callId, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {transcriptBadge(c.transcriptStatus || "")}
                  {!c.transcript ? (
                    <button
                      type="button"
                      className="text-slate-600 underline"
                      disabled={busy}
                      onClick={() => {
                        setTranscriptEditId((id) =>
                          id === c.callId ? null : c.callId
                        );
                        setTranscriptDraft("");
                      }}
                    >
                      {transcriptEditId === c.callId ? "Cancel" : "Add transcript"}
                    </button>
                  ) : null}
                </div>
                {transcriptEditId === c.callId ? (
                  <div className="mt-2 space-y-1">
                    <Textarea
                      rows={3}
                      value={transcriptDraft}
                      onChange={(e) => setTranscriptDraft(e.target.value)}
                      placeholder="Paste the call transcript…"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveTranscriptForExisting(c.callId)}
                        disabled={busy}
                      >
                        Save transcript
                      </Button>
                    </div>
                  </div>
                ) : null}
                {c.transcriptSummary ? (
                  <p className="mt-1 text-slate-600">{c.transcriptSummary}</p>
                ) : null}
                {c.transcript ? (
                  <div className="mt-1">
                    <button
                      type="button"
                      className="text-slate-500 underline"
                      onClick={() =>
                        setExpandedTranscript((id) =>
                          id === c.callId ? null : c.callId
                        )
                      }
                    >
                      {expandedTranscript === c.callId
                        ? "Hide transcript"
                        : "Show transcript"}
                    </button>
                    {expandedTranscript === c.callId ? (
                      <p className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-slate-700">
                        {c.transcript}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-0.5 text-slate-400">
                  {[c.caller, c.phoneUsed].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No calls logged for this lead yet.</p>
        )}
      </div>
    </div>
  );
}
