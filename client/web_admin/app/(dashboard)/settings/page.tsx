"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Avatar } from "@heroui/avatar";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Camera, Lock, User as UserIcon, Mail } from "lucide-react";
import { authApi, getErrorMessage } from "@/lib/api";
import { getStoredUser, storeAuth, getStoredToken } from "@/hooks/useAuth";
import { toast } from "@/lib/toast";
import { User } from "@/types";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      setFullName(stored.full_name);
      setEmail(stored.email);
    }
    // Re-fetch from server for freshness
    authApi.me().then((res) => {
      const fresh: User = res.data.data;
      setUser(fresh);
      setFullName(fresh.full_name);
      setEmail(fresh.email);
      const token = getStoredToken();
      if (token) storeAuth(token, fresh);
      // Notify sidebar via storage event
      window.dispatchEvent(new StorageEvent("storage", { key: "bw_user" }));
    }).catch(() => {});
  }, []);

  async function handleSaveProfile() {
    if (!fullName.trim() && !email.trim()) return;
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        ...(fullName.trim() !== user?.full_name ? { full_name: fullName.trim() } : {}),
        ...(email.trim() !== user?.email ? { email: email.trim() } : {}),
      });
      const updated: User = res.data.data;
      setUser(updated);
      setFullName(updated.full_name);
      setEmail(updated.email);
      const token = getStoredToken();
      if (token) storeAuth(token, updated);
      window.dispatchEvent(new StorageEvent("storage", { key: "bw_user" }));
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.warning("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await authApi.uploadProfileImage(formData);
      const { profile_image_url } = res.data.data as { profile_image_url: string };

      const fresh = await authApi.me();
      const updated: User = fresh.data.data;
      setUser({ ...updated, profile_image_url });
      const token = getStoredToken();
      if (token) storeAuth(token, { ...updated, profile_image_url });
      window.dispatchEvent(new StorageEvent("storage", { key: "bw_user" }));
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const profileChanged =
    (fullName.trim() && fullName.trim() !== user?.full_name) ||
    (email.trim() && email.trim() !== user?.email);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-default-400 text-sm mt-1">Manage your account profile and security</p>
      </div>

      {/* Profile Picture */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-base font-semibold text-foreground">Profile Picture</p>
        </CardHeader>
        <Divider />
        <CardBody className="pt-4">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar
                name={user?.full_name ?? ""}
                src={user?.profile_image_url ?? undefined}
                className="w-20 h-20 text-xl"
                color="primary"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-md hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
              <p className="text-xs text-default-400 capitalize">{user?.role}</p>
              <p className="text-xs text-default-400 mt-0.5">{user?.email}</p>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="mt-2"
                isLoading={uploadingAvatar}
                onPress={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? "Uploading…" : "Change Photo"}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <p className="text-xs text-default-400 mt-3">JPEG, PNG or WebP · Max 5 MB</p>
        </CardBody>
      </Card>

      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-base font-semibold text-foreground">Profile Information</p>
        </CardHeader>
        <Divider />
        <CardBody className="pt-4 space-y-4">
          <Input
            label="Full Name"
            value={fullName}
            onValueChange={setFullName}
            startContent={<UserIcon className="w-4 h-4 text-default-400" />}
            variant="bordered"
          />
          <Input
            label="Email Address"
            type="email"
            value={email}
            onValueChange={setEmail}
            startContent={<Mail className="w-4 h-4 text-default-400" />}
            variant="bordered"
          />
          <Button
            color="primary"
            isLoading={savingProfile}
            isDisabled={!profileChanged}
            onPress={handleSaveProfile}
            className="w-full sm:w-auto"
          >
            Save Changes
          </Button>
        </CardBody>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-base font-semibold text-foreground">Change Password</p>
        </CardHeader>
        <Divider />
        <CardBody className="pt-4 space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onValueChange={setCurrentPassword}
            startContent={<Lock className="w-4 h-4 text-default-400" />}
            variant="bordered"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onValueChange={setNewPassword}
            startContent={<Lock className="w-4 h-4 text-default-400" />}
            variant="bordered"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            startContent={<Lock className="w-4 h-4 text-default-400" />}
            variant="bordered"
            isInvalid={!!confirmPassword && newPassword !== confirmPassword}
            errorMessage="Passwords do not match"
          />
          <Button
            color="primary"
            isLoading={savingPassword}
            isDisabled={!currentPassword || !newPassword || !confirmPassword}
            onPress={handleChangePassword}
            className="w-full sm:w-auto"
          >
            Update Password
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
