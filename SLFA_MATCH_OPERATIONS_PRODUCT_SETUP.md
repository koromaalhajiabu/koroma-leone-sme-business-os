# SLFA Match Operations System — Product and Installation Guide

## Product position

**SLFA Match Operations System** is a separately licensed Koroma Leone Tech application inside Koroma Leone Tech SME Business OS. It is intended for a football association or federation to coordinate match-day administration.

It provides:
- Electronic team-sheet submission by each club's assigned Team Official.
- Fixture-specific Referee, Assistant Referee and Match Commissioner assignments.
- Referee match reports with scores, events, notes and photographic evidence.
- Match Commissioner reports and photographic evidence.
- Browser-based OCR extraction from report photographs.
- A Super Admin inbox for approving or returning team sheets and reviewing reports.
- Human verification of OCR text, with the original OCR output retained.
- Private evidence-photo storage, audit events and a product licence record.

This application is separate from the public SLFA League App. It does not replace a federation's competition, registration or public-facing systems. It also does not automatically publish team sheets or reports to the public league website.


## Standalone portal link

The standalone Match Operations portal is published separately from the main SME Business OS dashboard at:

**https://koromaalhajiabu.github.io/koroma-leone-sme-business-os/slfa-match-operations/**

The portal has its own sign-in screen and focused match-operations workspace. It uses the existing Koroma Leone Tech Supabase project, association identities, product licence records and tenant-scoped row-level security; it does not create a second copy of association data or expose the SME OS dashboard to match officials. Public self-registration is disabled. Association accounts must be approved, added as active workspace members and assigned the correct product role before access is granted. Workspace administration, competition setup and staff onboarding remain available through the main SME Business OS.

This is a separate application entry point and URL, not a separate database or custom domain. A live SLFA deployment still requires an SLFA-owned association workspace, the agreed commercial licence, named official accounts and an end-to-end acceptance pilot.

## Tenant and licence model

Every association operates inside its own approved SME Business OS workspace. The records are scoped to that association's `business_id`; they are not shared between customer workspaces.

The association product licence is separate from the normal SME workspace subscription. The Developer Control Centre stores the product status, package, validity period, agreement reference, internal notes and authorised official-seat limit. Licence management records the commercial agreement details; it does not collect payment or confirm a payment.

The product licence states are:
- `pending_activation`: workspace is provisioned, but operational submission is locked.
- `active`: operational functions are available within the recorded dates.
- `suspended`: operational submission is locked.
- `expired`: operational submission is locked.

The seat limit applies to assigned match-operations users (Super Admins, referees, assistant referees, Match Commissioners and Team Officials). General SME workspace staff who have not been assigned to this product are not counted as match-operations seats.

## Customer onboarding and activation

1. The association's authorised representative creates an account on the Koroma Leone Tech SME Business OS and confirms the email address.
2. From the Business Application, the representative chooses **Sports and local league management** and the business type **Football Association / Federation**. The representative enters the official association name and contact details.
3. Koroma Leone Tech reviews and approves the application through the existing Developer Console. Approval provisions the customer-owned association workspace, a Main Branch, the Sports & Local League configuration module, the SLFA Match Operations module and a pending product licence.
4. Open the protected **Platform Control Centre** and choose **SLFA Match Operations licences**. Locate the association workspace, set the package, start and expiry dates, authorised seats and agreement reference, then activate the licence after the commercial agreement has been completed.
5. The association owner or administrator signs in to its workspace. Under Employees, create or invite the staff who will use the system. Each official must be an active member of the association workspace before being assigned a match-operations role.

## Association setup

The SLFA Match Operations panel reuses the association's existing competition master records in the SME OS. This avoids maintaining a second copy of the competition and roster data.

1. Open **Sports & Local League** and create each competition and season.
2. Add the participating clubs.
3. Register the active players under the correct club and competition.
4. Create the fixtures, including home club, away club, venue and kick-off time.
5. Return to **SLFA Match Operations** and select the competition.

## Super Admin and official assignment

In **SLFA Match Operations → Officials & Access**, the association owner or administrator can appoint:
- **Association Super Admin** — may review team sheets and match reports, verify OCR text and manage official assignments within the selected competition.
- **Referee** — assigned to a specific fixture and may submit its referee match report.
- **Assistant Referee** — assigned to a specific fixture.
- **Match Commissioner** — assigned to a specific fixture and may submit its Match Commissioner report.
- **Team Official** — assigned to one club in a competition and may submit that club's team sheet for fixtures involving the club.

Only an association workspace owner or administrator can appoint an Association Super Admin. The association's Super Admin may assign match officials and Team Officials. Assigned users must first exist as active workspace members.

## Matchday workflows

### Electronic team sheets

The assigned Team Official chooses a scheduled fixture involving their club, selects exactly 11 starters and up to 9 substitutes, then submits the sheet. Submission closes 20 minutes before kick-off. Each club can have one current team sheet per fixture.

The team sheet is private while pending. The Super Admin can approve or return it with a correction note. Returned sheets can be corrected and resubmitted. Approved sheets are locked against further submission changes.

### Referee and Match Commissioner reports

The assigned Referee submits the score and match-event notes. The assigned Match Commissioner submits supervision observations and recommendations. Both roles can attach up to five photographs as evidence.

Photographs are uploaded to the private `slfa-match-evidence` storage bucket. The system runs English-language OCR in the browser and stores the extracted text, OCR state and confidence. The original photographs and machine-generated text remain available to the Super Admin.

The Super Admin reviews the report, checks the photographs, edits the verified text where needed, then marks the report reviewed or returns it with a correction note. A printable report view includes the structured report, machine OCR, verified text and evidence photographs.

## Access and security controls

- Association data is tenant-scoped by business and competition.
- Team Officials can read the team sheets for their assigned club and relevant fixtures.
- Match officials can read records for fixtures to which they are assigned.
- Super Admins and association workspace administrators can review the association's records.
- Direct client writes to the new team-sheet, match-report, assignment and licence tables are not granted. Changes are performed through role-checked database functions.
- Private photo access is governed by storage policies that check the association, fixture and assigned user.
- Assignment, submission and review actions are written to the existing business audit log.

## Pilot-readiness checks

Before accepting a live SLFA deployment, create a real association workspace, activate its licence, configure one competition and season, add two clubs and their approved player squads, schedule a fixture, create the actual staff accounts and test each workflow with the intended roles. Do not use fabricated staff or match records for acceptance testing.

The OCR feature is an assistive reader, not a handwriting-verification service. Its accuracy depends on image quality, handwriting, language and layout. Every extracted value must be checked against the original photograph before it is treated as an official record. The browser loads Tesseract.js from a public CDN, so photo OCR requires internet access at the time of processing.

The product has not been validated against a live SLFA association workspace yet. The schema and application wiring are installed in the Koroma Leone Tech platform, but an end-to-end acceptance test requires a real association workspace, active product licence, competition, clubs, players, fixtures and assigned user accounts.
 
## Matchday Command & Compliance Engine

The Command Centre is the operational control board for the selected competition. It computes a fixture readiness state from the existing official assignments, venue and kick-off fields, both clubs' team sheets, and the referee and Match Commissioner reports. It displays whether a fixture is awaiting preparation, team sheets, review, reports, ready for match, or closed. “In progress / result pending” is inferred from the fixture schedule; it is not a live match clock.

Referee and Match Commissioner report forms now include a structured list of players involved. When both clubs have approved team sheets, the Command Centre flags player IDs in submitted reports that do not appear on either approved sheet. It also flags referee-score conflicts with the fixture score and, where the Match Commissioner report carries structured score fields, differences between the two official reports. These are review flags, not automatic disciplinary decisions.

Association users can export the selected competition's operational board as CSV and open a printable match dossier for an individual fixture. A dossier brings together fixture details, appointments, team sheets, reports, OCR text, verified text, evidence photographs, and outstanding compliance notes. Evidence links are temporary signed links. OCR is expressly labelled unverified until checked by an authorised human reviewer.

The database scheduler runs the reminder generator every 15 minutes. It creates recipient-scoped in-app alerts for Team Officials when a team sheet is outstanding within 24 hours of kick-off (before the 20-minute cutoff), for assigned referees and Match Commissioners when reports are more than 90 minutes overdue, and for association administrators when sheets or reports await review. It also alerts administrators to referee-score conflicts. Alerts are deduplicated and each recipient can mark only their own alert as read. These are in-app alerts; email/SMS dispatch is not part of this release.

The upgrade is installed on the existing separately licensed SLFA Match Operations module. It does not merge the system into the public SLFA League App. Before sale or operational acceptance, Koroma Leone Tech and the association must complete a real pilot using genuine association accounts, fixtures and officials; validate reminder delivery and role permissions; and confirm that generated PDF/CSV records meet the association's approved recordkeeping requirements.
