## Planning table still loads

**Navigate to**:

```
Working Periods → select a Planning State work period
```

**Expected result**:

```
Planning table loads.
Existing Bite 26C-1 Avail. column still works.
Existing Bite 26C-2 filters still appear.
New candidate marking control appears.
No console errors.
No backend errors.
```

## Search collaborator filter

Use the Search collaborators filter.

**Test**:

```
Search by full name
Search by partial name
Search by nickname, if displayed
Search for a value that matches no one
```

**Expected result**:

```
Matching rows remain visible.
Non-matching rows are hidden.
The empty-state message appears when nothing matches.
Clear filters restores all rows.
```

## Selection filter

**Test**:

```
Selection = Selected only
Selection = Unselected only
Selection = All rows
```

**Expected result**:

```
Selected only shows selected collaborators.
Unselected only shows unselected collaborators.
All rows restores the full table.
```

## Availability filter

**Test each availability value**:

```
Avail. = A
Avail. = D
Avail. = L
Avail. = All availability
```

**Expected result**:

```
Only rows with the selected availability are visible.
Changing Avail. on a visible row updates the row correctly.
Clear filters restores all rows.
```

## Sector, Local, and Task filters

Use rows that have known planning values.

**Test**:

```
Filter by Sector
Filter by Local
Filter by Task
Combine Sector + Local + Task
```

**Expected result**:

```
Visible rows match the selected reference-data values.
Clearing each filter broadens the result correctly.
Clear filters resets all controls.
```

## Combined filters

**Apply multiple filters together, for example**:

```
Search collaborator + Selected only
Avail. D + Selected only
Sector + Task
Search + Avail. + Sector
```

**Expected result**:

```
Filters combine predictably.
Visible count updates correctly.
No rows disappear unexpectedly.
```

## Save behavior with hidden selected rows

This is the most important regression test.

**Steps**:

```
1. Select two collaborators.
2. Apply a filter that hides one of the selected collaborators.
3. Click Save plan.
4. Reload the page.
```

**Expected result**:
```
Both selected collaborators are saved, including the one hidden by the filter.
```

This confirms filters are display-only and do not accidentally limit the save payload.

Save behavior with hidden availability changes

**Steps**:
```
1. Change one collaborator Avail. from A to D.
2. Apply a filter that hides that collaborator.
3. Click Save plan.
4. Reload the page.
```

**Expected result**:

The hidden availability change is still saved.

```
1. Clear filters
```

After applying several filters, click Clear filters.

**Expected result**:

```
All filter controls reset.
All planning rows become visible again.
Visible count returns to the full row count.
Selected rows remain selected.
Changed availability values remain changed.
```

## Backend log check

```
After the manual smoke, check the backend logs.
```

**Expected result**:

```
No /assignments/bulk-plan 500 errors.
No planning_availability schema errors.
No unexpected internal API errors.
```

## Mark and unmark replacement candidates

**For a few collaborators**:

```
Mark candidate
Unmark candidate
Mark several candidates
```

**Expected result**:

```
Candidate marker toggles immediately.
Candidate count updates.
Candidate visual indicator appears/disappears.
No Save plan action is required for the UI marker to toggle locally.
```

## Candidate filter

**Use the new candidate filter**:

```
All rows
Candidates only
Non-candidates only
```

**Expected result**:

```
Candidates only shows only marked candidates.
Non-candidates only hides marked candidates.
All rows restores the full table.
Visible row count updates correctly.
```

## Combined filters with candidates

**Combine candidate filtering with existing filters**:

```
Candidate filter + Search
Candidate filter + Selected only
Candidate filter + Avail. D
Candidate filter + Sector / Local / Task
```

**Expected result**:

```
Filters combine predictably.
Clear filters restores all rows.
Candidate marks remain visible after clearing filters.
```

## Verify candidate marking is not saved yet

**Steps**:

```
1. Mark one or more collaborators as replacement candidates.
2. Do not select them.
3. Click Save plan.
4. Reload the page.
```

**Expected result**:

```
Save plan succeeds.
No replacement assignment is created.
Candidate marking does not persist after reload, unless the row was otherwise saved for selection/availability reasons.
```

This confirms the bite is only candidate marking, not assignment saving.

## Verify candidate marking does not alter save payload behavior

**Steps**:

```
1. Mark a collaborator as a candidate.
2. Leave them unselected.
3. Do not change Avail.
4. Click Save plan.
```

**Expected result**:

```
The row should not be sent merely because it was marked as a candidate.
No backend replacement assignment data should be saved.
No backend 500.
```

**Then test the existing save behavior still works**:

```
1. Select a collaborator.
2. Mark them as a candidate.
3. Click Save plan.
4. Reload.
```

**Expected result**:

```
The selected assignment saves as before.
Candidate marking itself does not persist as replacement assignment data.
```

## Regression check

**Quickly verify**:

```
Avail. A → D → L → A still saves correctly.
Hidden selected rows still save correctly.
Hidden availability changes still save correctly.
Clear filters still works.
```

## Backend log check

After the smoke, check logs for:

```
/assignments/bulk-plan
internal API error
planning_availability
replacement
```

**Expected result**:

```
No 500 errors.
No replacement assignment persistence errors.
No planning_availability schema errors.
```

# Validating Time Off Logic

## Basic planning table regression

Go to:

```
Working Periods → open a Planning State Work Period
```

**Confirm**:

```
Planning table loads.
Avail. column appears.
Cand. column appears.
Repl. column appears.
Filters still appear.
No console errors.
No backend errors.
```

## Row selection no longer jumps

## Mark original collaborator as Day Off and select replacement

**Steps**:

```
1. Identify the collaborator taking time off.
2. Set their Avail. to D.
3. Identify the replacement collaborator.
4. Check the replacement collaborator.
5. Check Cand. for the replacement collaborator.
6. Open the replacement collaborator’s Repl. dropdown.
```

**Expected**:

```
The Repl. dropdown lists the D collaborator.
The Repl. dropdown does not list normal A collaborators.
You can select the D collaborator as the replacement target.
```

**Then click Save plan, reload the Work Period, and confirm**:

```
Original collaborator remains D.
Replacement collaborator remains selected.
Replacement relationship still appears.
```

## Repeat the same workflow with Leave of Absence

**Steps**:

```
1. Set another original collaborator’s Avail. to L.
2. Select a different replacement collaborator.
3. Mark the replacement as Cand.
4. Open Repl.
5. Choose the L collaborator.
6. Save and reload.
```

**Expected**:

```
L collaborator appears as a valid Repl. target.
Relationship saves.
Reload preserves the relationship.
```

## Confirm active collaborators are not offered as replacement targets


**Steps**:

1. Leave several collaborators as A.
2. Open a replacement collaborator’s Repl. dropdown.

**Expected**:

```
Only D and L collaborators appear.
A collaborators do not appear.
The replacement row itself does not appear as its own target.
```

6. Confirm stale replacement target is cleared

**Steps**:

```
1. Set Maria to D.
2. Set João as replacement for Maria.
3. Change Maria back from D to A.
```

**Expected**:

```
Maria is no longer a valid Repl. target.
João’s replacement selection is cleared or no longer saved as replacing Maria.
```

Then save and reload.

**Expected**:

```
No invalid replacement relationship remains.
No backend error.
```

## Confirm replacement is Work Period only

**Steps**:

```
1. Save a replacement relationship on Work Period A.
2. Open another Work Period B.
```

**Expected**:

```
The replacement relationship does not automatically appear in Work Period B.
```

The relationship must be temporary for the selected Work Period only.

## Confirm save still includes hidden rows

Test this:

```
1. Set an original collaborator to D or L.
2. Select a replacement and choose Repl.
3. Apply a filter that hides either the original collaborator or the replacement collaborator.
4. Click Save plan.
5. Reload.
```

**Expected**:

```
The replacement relationship still saves correctly.
Filtering affects visibility only, not save behavior.
```

## Confirm normal selected assignment still works

**Steps**:

```
1. Select a normal A collaborator.
2. Do not mark Cand.
3. Do not choose Repl.
4. Save and reload.
```

**Expected**:

```
Normal assignment saves as before.
No replacement relationship is created.
```

## Backend log check

**After the smoke tests, check for**:

```
/assignments/bulk-plan
internal API error
replacement_for_assignment_id
planning_availability
```

**Expected**:

```
No 500 errors.
No planning_availability schema errors.
No replacement persistence errors.
```