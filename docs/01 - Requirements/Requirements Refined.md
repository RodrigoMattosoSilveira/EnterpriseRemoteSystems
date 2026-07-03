# Requirements

Owner: Rodrigo Silveira

# Problem Domain

Please build a mobile first app, that can run on a desktop, based on a Golang / Fiber backend, a SQLLite database using GORM, and a React Front End to track the earnings and expenses of business collaborators working for a company with remote locations, many working at a remote location and buying goods and services at the business mercantile. 

# Domain

Collaborators work at the business’ remote location for periods of 90 days, extended as necessary by the administrator; at the end of this period, collaborators return home and are eligible to return for another work journey after 30 days. 

Collaborators are compensated as a daily wage or salary, paid in Real, or commission paid in grams of gold based on the business daily production of the gold mine well they worked on.

Collaborators incur in expenses at the business mercantile by purchasing goods and services and paying either in Real or grams of gold. 

Collaborators working at a mine well can take up to three sick days. When doing so, they earn their daily commission and use it to pay 1 gram of gold to the Daily Wager who substituted them; in addition to earning 1 gram of gold, the daily wager also accrues his daily wages.

Collaborators working at a mine well can take a license extending to the default end of their work journey. . When doing so, they earn half of their daily commission and use the other half to pay the Daily Wager who substituted them; in this case, the daily wager does not accrue his daily wages.

At any point the administrator should be able to examine the daily earnings and expenses of a collaborator, including their potential earnings thru the projected end of their current work journey.

## Entities

### Person

Is an individual who has been or is under contract with the business; this entity holds:

- ID
- Name, must be unique
- Address
- Phone, must be unique
- Email, must be unique
- CPF  - a Brazilian fiscal identification; must be unique
- Bank data
- PIX - a Brazilian fiscal identification; must be unique
- Emergency contact information
- Status, one of:
    - Active - Currently under contract
    - Inactive - Currently out of contract, but a candidate to return
    - Discontinued - Currently out of contract, but not a candidate to return
- NOTE: These records are never deleted.

### Collaborator

Is a *Person* who is *under contract* with the business; this domain holds:

- ID - must be unique,
- PersonID
- Date of the start of this work journey
- Date of the default end of of this work journey - start plus 90 days
- Extension of this work journey, in days, of this work journey;
- Projected end of this work journey - default + extension
- Method of Payment, one of daily wages, monthly salary, or commission, from Reference Data;
- Payment Value - one of daily wages, monthly salary, or percentage of the well production this collaborators earns
- Sector - Derived from the Reference Data;
- Location - Derived from the Reference Data;
- Task -  Derived from the Reference Data;
- Status, one of:
    - Active- The collaborator is available to planning;
    - Sick- The collaborator took a sick dat;
    - License - The collaborator took a leave of absence;
    - Finished - The collaborator work journey is finished;
- NOTE: These records are never deleted.

### Mine Well Production

The administrator records each mine well production at the end of a period of work at a mine well, there are two daily periods of 12 hours each.

- Date
- Period - The combination of Date / Period must be unique; there can be gaps;
- Well name - derived from the reference data;
- Production in grams of gold;
- Comments

### Gold Price

The administrator records the price of Gold at 11:00 AM, obtained from a source approved by the business administration.; this entity includes:

- Date
- Price, in real/grams
- Comments

### Price List

A roster of all the goods and services a collaborator can incur; this entity includes:

- ID - must be unique
- Name
- Description
- Price in Real
- Price in Grams of Gold, converted based on the most recent quote, derived from Gold Price;

### Current Account

The table with the collaborators’ accrued earnings and expenses; the common attributes include:

- ID
- RevertedID
- ID - CollaboratorID
- Date
- Method - how the collaborator is paid, one of (See Reference Data)
    - Daily Wages
    - Salary
    - Commission
- Currency - the currency the collaborator’s earnings is accrued on;
    - Real
    - Gold
- C/D - whether the accrual is an earning of an expense
    - Credit
    - Debit
- Item (Method/Sector/Location/Task) - A string of strings describing the transaction; see Services for more details
- Quantity - The numbers of items; it is always one for credits
- Comments

#### Current Account  Real

- Unit Price Real
- Total Price Real

#### Current Account Gold

- Unit Price Real
- Total Price Real

## Value Objects

A collection of table with data used across the application .

### Sector

A generic space within the business facility where operations relevant to the current account system take place (office, mercantile, well, etc.). Acceptable values are:

- Mine
- Office
- Canteen
- Mill
- NOTE: The application must provide for adding new items

### Location

A specific space within the business facility where operations relevant to the current account system take place (well 1, well 1, well 1, office, burn house, vault house, canteen, warehouse).  Acceptable values are:

- well 1
- well 2
- well 3
- office
- burn house
- vault house
- canteen
- warehouse
- NOTE: The application must provide for adding new items

### Task

A specific job the collaborator is contracted for (Collaborator) and which he was planned for (Plan):

- Administrador
- Ajudante
- Boroquiero
- Britador\
- Cozinheiro
- Guincheiro
- Jeriqueiro\
- Madeirador
- Moinho
- Poço
- Quebrador Pedra
- Serrador
- Servicos Gerais
- Tratorista
- NOTE: The application must provide for adding new items

---

### Method

The collaborator’s form of payment, recorded in their Collaborator record, and liable to change as necessary there and in the planning phase. Acceptable values are:

- Daily Wages
- Salary
- Commission
- NOTE: The application must provide for adding new items

### Person Status

Person records are never deled; we manage them by their statuses. Acceptable values are:

- Active - Currently under contract
- Inactive - Currently out of contract, but a candidate to return
- Discontinued - Currently out of contract, but not a candidate to return
- NOTE: The application must provide for adding new items

### Collaborator Status

Collaborators records are never deled; we manage them by their statuses. Acceptable values are:

- Active- The collaborator is available to planning;
- Sick- The collaborator took a sick dat;
- License - The collaborator took a leave of absence;
- Finished - The collaborator work journey is finished;
- NOTE: The application must provide for adding new items

## Services

### Earning

Collaborators’ earnings are accrued and recorded in the collaborator’s current account from work plans crated thru a three stage workflow. Each workflow yields the planning for the next period, based on the previous period’s plan:

- Plan - The planner uses the previous period plan to start the next period’s plan; he then makes adjustments to  handle sick and license situations, and any other adjustments necessary;
- This is a form much like the Collaborator’s, which is:
    - Derived from the previous period, with a column (Include / Exclude) set to Include designed to allow the planner to refine the plan;
    - Derived from the collaborators not in the previous period, with a column (Include / Exclude) set to Exclude designed to allow the planner to refine the plan;
- Inform - The planner prints a nicely formatted plan  to inform the collaborators about their next period assignments.
    - Prints only the Collaborators marked as Include in the plan;
- Accrual - At the end of the work period, the planner makes adjustments to reflect the actual work done and accrues the collaborator’s earnings.
    - Adds all record to the Accrual Table
- NOTE: The commissioned collaborators’s earnings are accrued based on the mine well production for the period in question; if it not recorded, the accrual remains on hold until mine well production for the period is recorded;

### Expense

Collaborators’ expenses are accrued and recorded in the collaborator’s current account  by a collaborator purchasing a good or service from the business. There are few categories of goods and services that a collaborator can incur:

- Canteen - Things like dental paste, socks, etc.; these are available in a price list, in Real and grams of gold, based on the gold quotation for the day;
- PIX - Collaborators send money to their PIX accounts; this is always in Real;
- Flights - Collaborators pay for their flights in and out of the mine operation facility; these are available in a price list, in Real and grams of gold, based on the gold quotation for the day;
- Pay Daily Wager - Commissioned Collaborators pay daily wagers who substituted for them when they took sick days;
- Diverse - Any good or service not in the price list;
- NOTE: Collaborators can pay their expenses in Real or Grams of Gold, based on the gold quotation of the day; the expense is accrued in the currency chosen by the collaborator.

The workflow for an expense request is as follows:

- The collaborator requests assistance with the purchase of a good or service;
- The administrator triggers the Expense Service;
- The application displays a form showing
    - Column A
        - Rows 1 - 3: Collaborator Name, Work Journey Projected End, Payment Method
        - Rows x - y: The application shows a simple summary of the collaborator’s balances in Real and grams of gold, as well as the collaborators potential earnings. This enables the administrator decide whether to take the risk of allow the collaborator incur into an expense that causes a negative balance;
        - Row z - Identifies that daily wager who receives 1 gram of gold to replace a sick commissioned collaborator.
    - Column B
        - Currency (Real or Gold)
    - Column C
        - For each item
            - Item
            - Quantity
            - Unit Price (in Real or grams of gold)
            - Total Price (in Real or grams of gold)
        - For all Items
            - Total Price (in Real or grams of gold)
    - Row below all columns
        - Comments
    - Row below Comments
        - Collaborator’s Agreement
- The administrator, together with the collaborator, decide whether to charge the expense in Real or grams of gold.
- The collaborators selects to purchase one of more goods or services, and the administrator records them one at a time, collecting the following data:
    - Currency
    - Item
    - Quantity
    - Unit Price (in Real or grams of gold)
    - Total Price (in Real or grams of gold)

The application collects the following expense data:

- See the CurrentAccount Entity

### Current Account

These are services are associated with viewing summaries and details of a collaborator’s earnings and expenses, and a few additional services:

- Summary - A view of the earning and expenses, and balance in Real and Gold, as well as the projected earnings, in the currency associated with the collaborator’s record.
- Detail in Real - A detailed view of all the collaborator’s earnings and expenses, in Real, during the current work journey;
- Details in Gold - A detailed view of all the collaborator’s earnings and expenses, in Gold, during the current work journey;
- Revert - Reverts a current account entry; this is done by selecting an active current account record and generating a record, including RevertID—the ID of the current account record being reverted, the opposite C/D of the original transaction, and the Item attribute identifying the action;
- Zero - A collaborator can, at any given point during his work journey, request full payment of his credit in grams of gold.
- Close - This closes the collaborators work journey, triggering a payment of his credit in Real and grams of gold.

[Architecture](https://www.notion.so/Architecture-34b5fe67c6cf8053ad69d28bfb6fb076?pvs=21)
