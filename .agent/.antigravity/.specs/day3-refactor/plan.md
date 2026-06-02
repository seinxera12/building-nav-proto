Day 3 — Navigation Workflow + Manual Progression Implementation

Status: Ready to implement.

Goal:

Transform the application from a QR-anchored location viewer into a complete indoor navigation experience:

QR Anchor → Destination Search → Route Display → Begin Navigation → Step Progression → Manual Location Updates → Rerouting → Arrival / Cancel.

Current Repo State

Day 3 starts after:

floor rendering exists
routing endpoint exists
QR anchoring exists
current location rendering exists
route polyline rendering exists

QR is no longer used during navigation.

QR is only used to establish initial location.

Navigation progression is driven by user confirmations and manual location updates.

Navigation Model Changes
Previous Model
Scan QR
→ Advance Navigation
→ Scan QR
→ Advance Navigation
New Model
Scan Entry QR
→ Current Location Established

Search Destination
→ Route Generated

Begin Navigation

"I'm Here"
→ Advance Step

Update My Location
→ Optional Reroute

Arrived
→ End Navigation
Navigation State Machine

Replace QR-driven progression with navigation lifecycle states.

States:

UNLOCATED
ANCHORED
ROUTE_PREVIEW
NAVIGATING
REROUTING
ARRIVED

State meanings:

UNLOCATED

application opened
no location anchor established

ANCHORED

QR scanned
current location known
no active route

ROUTE_PREVIEW

destination selected
route calculated
awaiting Begin

NAVIGATING

active navigation session

REROUTING

recalculating route

ARRIVED

destination reached
Destination Search UI
Backend Usage

Use:

GET /pois?floor=1

Retrieve:

POI id
POI name
nearest_node_id
UI

Implement:

Search Input
Filtered Results List

No external search library.

Filtering performed client-side.

Selection Flow
User selects POI
↓
POST /route
↓
Current Position
→ Destination Node
↓
Route Returned
↓
Display Polyline
↓
ROUTE_PREVIEW
Additional Selection Method

POI markers on map must be clickable.

Clicking marker performs identical route-generation flow.

Route Preview Mode

After destination selection:

Show:

destination name
route distance
estimated walking distance
step count

Display:

[ Begin ]

Navigation does not start automatically.

Route remains preview-only until Begin is pressed.

Begin Navigation

Begin button:

ROUTE_PREVIEW
↓
NAVIGATING

Actions:

lock destination
initialize step index
initialize progress tracking
start instruction panel

Destination cannot be changed until navigation is cancelled or completed.

Step-by-Step Instruction Panel

Implement mobile-first bottom sheet.

Contents:

Current Instruction

Example:

Proceed straight toward Elevator Lobby

Additional metadata:

Distance to Next Waypoint
Total Remaining Distance
Step X of Y

Display:

Current Step
Next Step Preview

Current step should be visually highlighted.

Step Advancement

Navigation progresses via confirmation.

Primary action:

I'm Here

Behavior:

Current Step Complete
↓
Advance Step Index
↓
Update Current Position
↓
Update Blue Dot
↓
Render Next Instruction

If final step completed:

ARRIVED

Animate instruction transitions using lightweight CSS slide-up animation.

Manual Location Update

Navigation must support manual correction.

Provide:

Update My Location
Flow

Button pressed:

Enter Map Selection Mode

User taps approximate position.

Coordinates sent to:

POST /snap

Backend returns:

{
  "nodeId": 47
}

Nearest navigation node becomes current location.

Blue dot updates immediately.

Rerouting Logic

After location update:

Compare:

New Node
vs
Remaining Route Nodes

If new node belongs to remaining route:

Update Position Only

If new node is outside route:

REROUTING

Display:

Recalculating...

Call:

POST /route

Using:

Current Node
→ Original Destination

Destination must be preserved.

Replace:

route geometry
instructions
remaining waypoints

Log:

reroute

event.

Return:

NAVIGATING
Cancel Navigation

Available during:

NAVIGATING

Show confirmation:

Cancel Navigation?

Actions:

remove route
clear destination
clear instructions
clear progress

Return to:

ANCHORED

Current location remains preserved.

Arrival Flow

When final instruction completed:

ARRIVED

Show:

Destination Card

Contents:

destination name
completion status

Actions:

End Navigation

On completion:

Emit:

path_complete

event.

Clear navigation state.

Return:

ANCHORED

Current location remains available.

Store Changes

Navigation store becomes source of truth.

Owns:

status
currentNodeId
destinationNodeId
route
instructions
currentStep
progress
remainingDistance
isSelectingLocation
error

Actions:

anchorLocation()
selectDestination()
beginNavigation()
advanceStep()
updateLocation()
reroute()
cancelNavigation()
completeNavigation()
resetNavigation()

No UI component should manage navigation state internally.

Full Verification Flow

Required Day 3 demonstration:

Scan Entry QR
↓
Location Anchored
↓
Search Cafeteria
↓
Route Displayed
↓
Begin Navigation
↓
Complete 3 Instructions
↓
Update My Location
↓
Reroute
↓
Continue Navigation
↓
Cancel Navigation

All steps must execute entirely inside browser without requiring additional QR scans after initial anchoring.