# Human Path Contact Reachability Design Need

Date: 2026-07-20
Status: design needed before UI implementation

## Approved product behavior

- A verified LinkedIn profile is the preferred contact route.
- A direct professional contact page is the only fallback route.
- Email is not a Human Path contact route and must not be offered as an action.
- When neither route is verified, the contact has an explicit `none` reachability state.
- After contact selection and any gap-fill search, the provider makes at most one additional
  batched search when accepted contacts still have no verified route. This search may enrich only
  those existing contacts and may not add or reclassify people.

## Design need

The Human Path contact card needs a small treatment that communicates when no verified contact route was found. The treatment must not imply that the contact itself is unverified. It only describes whether the product found a usable way to reach that person.

The later design pass must decide:

1. The label and placement for the no-route state.
2. Whether a LinkedIn search action is shown when a direct profile is unavailable.
3. How the state appears on both the Contacts step and the generated-message step.
4. Whether a contact with no verified route starts unselected. A hard selection or progression block is a separate gate decision and is not approved.

## Existing production mapping

- Surface: Human Path wizard, Contacts and Outreach steps.
- Existing card: `design-system/components/apply-wizard.html`.
- Existing live component: `app/dashboard/ApplyWizardModal.tsx`.
- Existing action primitive: `seeProfileBtn`, currently used by the LI Profile action.

No UI, CSS, public copy, or design-system change is authorized by this document.
