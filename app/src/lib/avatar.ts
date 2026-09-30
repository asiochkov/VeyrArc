import { useAuth } from './auth';
import { db } from './supabase';

/* Profile photo: picked from the device, cropped to a square, resized to 160 px JPEG (≈10 KB data URL). */
export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}

/* picked during onboarding before the guest account exists: saved together with the profile */
let pending: string | null = null;
export const takePendingAvatar = () => { const p = pending; pending = null; return p; };

export async function saveAvatar(url: string) {
  const st = useAuth.getState();
  const uid = st.session?.user.id;
  if (st.profile) useAuth.setState({ profile: { ...st.profile, avatar_url: url } });
  if (!uid || !st.profile) { pending = url; if (!uid) return; }
  const r = await db().from('profiles').update({ avatar_url: url }).eq('id', uid);
  if (r.error) throw r.error;
}
