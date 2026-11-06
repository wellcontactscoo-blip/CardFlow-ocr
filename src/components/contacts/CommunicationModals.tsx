"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, Mail, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  normalizePhoneForWhatsApp,
} from "@/lib/utils";
import type { Contact } from "@/types/database";

export function WhatsAppActionModal({
  contact,
  isOpen,
  onClose,
}: {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (contact) {
      setPhone(contact.phone || contact.alternate_phone || "");
      const greetingName =
        contact.first_name || contact.full_name || "there";
      const companyPart = contact.company_name
        ? ` from ${contact.company_name}`
        : "";
      setMessage(
        `Hi ${greetingName}, it was great connecting with you${companyPart}. Sharing my contact details here for easy follow-up.`
      );
    }
  }, [contact]);

  if (!contact) return null;

  const normalizedDigits = normalizePhoneForWhatsApp(phone);
  const targetUrl = buildWhatsAppUrl(phone, message);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Open WhatsApp Chat"
      description="Review the normalized international phone number and edit your prefilled message before opening WhatsApp."
    >
      <div className="space-y-4">
        <Input
          label="Recipient Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          helperText={
            normalizedDigits
              ? `Normalized international format: https://wa.me/${normalizedDigits}`
              : "Enter a valid phone number with country code."
          }
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="wa-message-body"
            className="text-xs font-semibold text-[#202B42]"
          >
            Prefilled Message (Editable)
          </label>
          <textarea
            id="wa-message-body"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-[#DDE4F0] bg-white p-3 text-sm text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
          />
          <p className="text-[11px] text-[#5A6782]">
            Clicking the button below opens WhatsApp with this text prefilled.
            Messages are not sent automatically until you press send inside
            WhatsApp.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE4F0]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <a
            href={targetUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!normalizedDigits) {
                e.preventDefault();
                return;
              }
              onClose();
            }}
          >
            <Button
              variant="primary"
              disabled={!normalizedDigits}
              leftIcon={<MessageSquare className="w-4 h-4 text-[#19C6B3]" />}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open in WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}

export function EmailActionModal({
  contact,
  isOpen,
  onClose,
}: {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (contact) {
      setRecipient(contact.email || "");
      setSubject(
        `Great connecting with you${
          contact.company_name ? ` - ${contact.company_name}` : ""
        }`
      );
      const greeting = contact.first_name || contact.full_name || "Hello";
      setBody(
        `Hi ${greeting},\n\nIt was a pleasure connecting with you and exchanging visiting cards. Looking forward to staying in touch.\n\nBest regards,`
      );
    }
  }, [contact]);

  if (!contact) return null;

  const mailtoUrl = buildMailtoUrl(recipient, subject, body);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose Email"
      description="Customize the recipient, subject, and message body before opening your email client."
    >
      <div className="space-y-4">
        <Input
          label="Recipient Email"
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email-message-body"
            className="text-xs font-semibold text-[#202B42]"
          >
            Message Body
          </label>
          <textarea
            id="email-message-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-xl border border-[#DDE4F0] bg-white p-3 text-sm text-[#202B42] focus:outline-none focus:ring-2 focus:ring-[#3478F6]"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE4F0]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <a
            href={mailtoUrl || "#"}
            onClick={(e) => {
              if (!recipient.trim()) {
                e.preventDefault();
                return;
              }
              onClose();
            }}
          >
            <Button
              variant="secondary"
              disabled={!recipient.trim()}
              leftIcon={<Mail className="w-4 h-4" />}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open Email Client
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}

