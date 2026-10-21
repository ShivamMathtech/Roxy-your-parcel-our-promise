import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };
export const CITIES = ['Dehradun', 'Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Jaipur', 'Lucknow', 'Chandigarh', 'Ahmedabad'];
export const STATUSES = ['booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'];
export const STEPS = STATUSES.slice(0, 5);
export const now = () => new Date().toISOString();
export const id = (prefix = '') => prefix + randomBytes(10).toString('hex');
export const clean = (value, label, min = 1, max = 250) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${label} must be ${min}–${max} characters.`);
  return value.trim();
};
export function email(value) {
  const result = clean(value, 'Email', 5, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Enter a valid email address.');
  return result;
}
export function phone(value) {
  const result = clean(value, 'Phone', 8, 22);
  if (!/^\+?[\d\s()-]{8,22}$/.test(result)) fail(400, 'Enter a valid phone number.');
  return result;
}
export function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, 'Use a password with 10–128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, expected] = hash.split(':');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}
export function address(value) {
  if (!value || typeof value !== 'object') fail(400, 'Address is required.');
  const a = { name: clean(value.name, 'Contact name', 2, 80), phone: phone(value.phone), line: clean(value.line, 'Street address', 5, 250), city: clean(value.city, 'City', 2, 60), pincode: clean(value.pincode, 'PIN code', 6, 6) };
  if (!CITIES.includes(a.city)) fail(400, 'Choose a city from our service area.');
  if (!/^[1-9]\d{5}$/.test(a.pincode)) fail(400, 'PIN code must contain six digits and cannot start with zero.');
  return a;
}
export function number(value, label, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${label} must be between ${min} and ${max}.`);
  return n;
}
export function parcel(value) {
  if (!value || typeof value !== 'object') fail(400, 'Parcel details are required.');
  if (!['document', 'parcel', 'fragile'].includes(value.type)) fail(400, 'Choose a parcel type.');
  return { type: value.type, description: clean(value.description, 'Parcel description', 2, 250), weight: number(value.weight, 'Weight (kg)', 0.1, 30), length: number(value.length, 'Length (cm)', 1, 120), width: number(value.width, 'Width (cm)', 1, 120), height: number(value.height, 'Height (cm)', 1, 120) };
}
export function quote(input, courier) {
  if (!courier) fail(400, 'Choose an available courier.');
  if (!CITIES.includes(input.pickup_city) || !CITIES.includes(input.drop_city)) fail(400, 'Choose supported pickup and destination cities.');
  const p = parcel(input.parcel);
  const volumetric = Math.round(p.length * p.width * p.height / 5000 * 100) / 100;
  const billable = Math.ceil(Math.max(p.weight, volumetric) * 2) / 2;
  const local = input.pickup_city === input.drop_city;
  const base = courier.base_paise + Math.round(billable * courier.kg_paise);
  const route = local ? 0 : 8000;
  const handling = p.type === 'fragile' ? 4000 : 0;
  const tax = Math.round((base + route + handling) * 0.18);
  return { base_paise: base, route_paise: route, handling_paise: handling, tax_paise: tax, total_paise: base + route + handling + tax, billable_weight: billable, volumetric_weight: volumetric, estimated_days: local ? Math.max(1, courier.days - 1) : courier.days, courier_id: courier.id, currency: 'INR' };
}
export function validPickupDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Choose a pickup date.');
  const day = new Date(value + 'T00:00:00Z');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const difference = (day - today) / 86400000;
  if (!Number.isFinite(difference) || day.toISOString().slice(0, 10) !== value || difference < 0 || difference > 30) fail(400, 'Pickup must be today or within the next 30 days.');
  return value;
}
export function transition(current, next) {
  if (current === 'booked' && next === 'cancelled') return;
  if (STEPS.indexOf(next) !== STEPS.indexOf(current) + 1 || !STEPS.includes(current) || !STEPS.includes(next)) fail(409, 'This status change is not allowed. Follow the delivery sequence.');
}
