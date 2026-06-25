import assert from "node:assert/strict";
import { classifyOccupation } from "../app/scans/occupation-classifier.ts";

function job(overrides) {
  return {
    title: "Digital Producer",
    department: "Creative Studio",
    descriptionText: "Own digital production, campaign delivery, vendor timelines, creative reviews, and asset delivery.",
    companyName: "Test Company",
    location: "Remote",
    remoteType: "remote",
    salaryText: "",
    ...overrides,
  };
}

assert.equal(classifyOccupation(job({ title: "Copywriter" })).lane, "creative-writing");
assert.equal(classifyOccupation(job({ title: "Art Director" })).lane, "art-direction");
assert.equal(classifyOccupation(job({ title: "UX Designer" })).lane, "product-ux-design");
assert.equal(classifyOccupation(job({ title: "UX Researcher" })).lane, "ux-research");
assert.equal(classifyOccupation(job({ title: "Creative Strategist" })).lane, "creative-strategy");
assert.equal(classifyOccupation(job({ title: "Executive Creative Director" })).lane, "creative-leadership");
assert.equal(classifyOccupation(job({ title: "Broadcast Producer", descriptionText: "Produce video shoots, scripts, edits, post production, and broadcast delivery." })).lane, "content-video-production");
assert.equal(classifyOccupation(job({ title: "Digital Producer" })).lane, "digital-production");
assert.equal(classifyOccupation(job({ title: "Technical Producer", descriptionText: "Own technical production for interactive prototypes and engineering partners." })).lane, "technical-production");
assert.equal(classifyOccupation(job({ title: "Social Producer", descriptionText: "Own short form social creative for TikTok, Instagram, and YouTube." })).lane, "social-creative");
assert.equal(classifyOccupation(job({ title: "Regional Partner Marketing Manager", descriptionText: "Own partner marketing strategy, co-marketing programs, and growth." })).lane, "marketing-management");
assert.equal(classifyOccupation(job({ title: "Software Engineer" })).lane, "technical-engineering");
assert.equal(classifyOccupation(job({ title: "Producer, Global Events", descriptionText: "Plan executive event logistics, vendors, run of show, travel, and venue operations." })).lane, "unknown");
assert.equal(classifyOccupation(job({ title: "Technical Program Manager – Adversarial Model Research", descriptionText: "Coordinate model research programs across researchers, safety teams, and evaluation partners." })).lane, "research-fellowship");
assert.equal(classifyOccupation(job({ title: "Product Operations Manager", descriptionText: "Own product launch operations, GTM readiness, roadmap rituals, and cross functional product planning." })).lane, "product-operations");
assert.equal(classifyOccupation(job({ title: "Program Manager - IT Operations", descriptionText: "Manage IT systems, cloud infrastructure, access controls, and enterprise service delivery." })).lane, "technical-infrastructure-program");
assert.equal(classifyOccupation(job({ title: "Talent Acquisition Operations Program Manager", descriptionText: "Own recruiting operations, hiring workflows, and talent acquisition systems." })).lane, "people-operations-program");
assert.equal(classifyOccupation(job({ title: "Procurement Operations Lead", descriptionText: "Lead procurement workflows, vendor contracts, sourcing, and purchasing operations." })).lane, "finance-procurement-operations");

console.log("Dumpster Fire occupation classifier fixtures passed.");
