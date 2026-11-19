-- Admins can dismiss a failed email instead of retrying it.
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'DISMISSED';
