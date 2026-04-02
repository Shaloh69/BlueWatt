"use client";

import { Button } from "@heroui/button";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmColor?: "danger" | "warning" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen, onClose, onConfirm,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  confirmColor = "danger",
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} size="sm" placement="center">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-danger">
          <AlertTriangle className="w-5 h-5" />
          {title}
        </ModalHeader>
        <ModalBody>
          <p className="text-default-500 text-sm">{description}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={loading}>Cancel</Button>
          <Button color={confirmColor} onPress={onConfirm} isLoading={loading}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
