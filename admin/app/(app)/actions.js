'use server';
import { revalidatePath } from 'next/cache';
import { getSession, isAdmin } from '@/lib/session';
import * as cp from '@/lib/controlplane';

// Authorize a write against a specific partner: QARO admin, or a partner user
// acting on their own partner. Never trust a partner_id from the form alone.
async function partnerGuard(partnerId) {
  const s = await getSession();
  if (!s) return { error: 'not signed in' };
  if (isAdmin(s)) return { session: s };
  if (s.pid && s.pid === partnerId) return { session: s };
  return { error: 'forbidden' };
}

export async function createPartnerAction(_prev, form) {
  const s = await getSession();
  if (!isAdmin(s)) return { error: 'forbidden' };
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind') || 'garage');
  if (!name) return { error: 'Name is required' };
  try {
    const partner = await cp.createPartner(name, kind);
    revalidatePath('/partners');
    return { ok: true, message: `Created “${partner.name}”`, id: partner.id };
  } catch (e) {
    return { error: e.message };
  }
}

export async function setPartnerStatusAction(_prev, form) {
  const s = await getSession();
  if (!isAdmin(s)) return { error: 'forbidden' };
  const id = String(form.get('id') || '');
  const status = String(form.get('status') || '');
  try {
    await cp.setPartnerStatus(id, status);
    revalidatePath('/partners');
    revalidatePath(`/partners/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function createCampaignAction(_prev, form) {
  const partnerId = String(form.get('partner_id') || '');
  const guard = await partnerGuard(partnerId);
  if (guard.error) return { error: guard.error };
  const name = String(form.get('name') || '').trim();
  if (!name) return { error: 'Campaign name is required' };
  try {
    const campaign = await cp.createCampaign({
      partner_id: partnerId,
      name,
      status: String(form.get('status') || 'draft'),
      budget: form.get('budget') || null,
      starts_at: form.get('starts_at') || null,
      ends_at: form.get('ends_at') || null,
    });
    revalidatePath(`/partners/${partnerId}`);
    return { ok: true, message: `Campaign created`, id: campaign.id };
  } catch (e) {
    return { error: e.message };
  }
}

export async function setCampaignStatusAction(_prev, form) {
  const id = String(form.get('id') || '');
  const campaign = await cp.getCampaign(id).catch(() => null);
  if (!campaign) return { error: 'not found' };
  const guard = await partnerGuard(campaign.partner_id);
  if (guard.error) return { error: guard.error };
  try {
    await cp.setCampaignStatus(id, String(form.get('status') || ''));
    revalidatePath(`/partners/${campaign.partner_id}`);
    revalidatePath(`/campaigns/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function createAdAction(_prev, form) {
  const campaignId = String(form.get('campaign_id') || '');
  const campaign = await cp.getCampaign(campaignId).catch(() => null);
  if (!campaign) return { error: 'campaign not found' };
  const guard = await partnerGuard(campaign.partner_id);
  if (guard.error) return { error: guard.error };
  const placement = String(form.get('placement') || '').trim();
  const imageUrl = String(form.get('image_url') || '').trim();
  if (!placement || !imageUrl) return { error: 'Placement and image URL are required' };
  try {
    const ad = await cp.createAd({
      campaign_id: campaignId,
      partner_id: campaign.partner_id,
      placement,
      image_url: imageUrl,
      title: String(form.get('title') || '') || null,
      target_url: String(form.get('target_url') || '') || null,
      weight: form.get('weight') || 1,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: 'Ad created', id: ad.id };
  } catch (e) {
    return { error: e.message };
  }
}

export async function setAdStatusAction(_prev, form) {
  const id = String(form.get('id') || '');
  const campaignId = String(form.get('campaign_id') || '');
  const campaign = await cp.getCampaign(campaignId).catch(() => null);
  if (!campaign) return { error: 'not found' };
  const guard = await partnerGuard(campaign.partner_id);
  if (guard.error) return { error: guard.error };
  try {
    await cp.setAdStatus(id, String(form.get('status') || ''));
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function createInviteAction(_prev, form) {
  const partnerId = String(form.get('partner_id') || '');
  const guard = await partnerGuard(partnerId);
  if (guard.error) return { error: guard.error };
  // Partner members can't invite; only admins or partner_admins.
  if (!isAdmin(guard.session) && guard.session.role !== 'partner_admin') {
    return { error: 'forbidden' };
  }
  const email = String(form.get('email') || '').trim();
  const role = String(form.get('role') || 'partner_member');
  if (!email) return { error: 'Email is required' };
  try {
    const token = await cp.createInvite(partnerId, email, role);
    revalidatePath(`/partners/${partnerId}`);
    return { ok: true, token, email };
  } catch (e) {
    return { error: e.message };
  }
}
