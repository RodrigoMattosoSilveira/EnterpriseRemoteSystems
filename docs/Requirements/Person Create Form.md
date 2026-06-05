# Introduction
A Person record should support two concepts:
- can be created
- is complete enough to become a Collaborator

There are a few data categories:
- Personal
- Bank
- Emergency
- System

The Personal data section. must be the filled prior to anything else, all fields are mandatory and the record cannot be added prior to these filled being filled correctluy. The remaining data sections could be filled at a later time, even though they have mandatory fields. An incomplete Person record cannot be used to generate a Collaborator record; therefore impeding such a person to incur in earnings or expenses until their Person record is fully filled with valid data. 

# Personal
The fields are:
- Name     - Required;
  - First  - A valid string
  - Last   - A valid string
- Nickname - A valid string
- CPF      - Required; a Brazilian financisl number; must be valid and unique;
- RG       - Required; a Brazilian National Identity string; must be valid and unique;
- Cellular - Required; a Brazilian National cell phone number; must be valid and unique;
- Email    - Required; must be valid and unique email;

# Address
The fields are:
- Street 1  - Required string; 
- Street 2  - Optional;
- State     - Required; a Brazilian state name; must be valid;
- CEP       - Required; a Brazilian postal code Number; must be valid for the state;
- City      - Required; a Brazilian city name; must be valid for the state;
- Country   - Required; always Brasil (notice the Portuguese spelling);

# Bank
The fields are:
- Name             - Required; the bank name; ; must be valid;
- Number           - Required; the bank number;
- Checking Account - Required; the checking account number;
- PIX              - Required; A number used to send money electronically; ; must be unique;

# Emergency
The fields are:
- Name     - Required; a string;
- Cellular - Required; a Brazilian national cell phone number; must be valid;
- Email    - Required; must be a valid email;

# Other
- Date Created
- Date Updated
- Status

# Notes:
Ideally we would have validation logic (front and back end) to ensure data integrity. In some cases, there might be services that provide the valid data, in other cases there might regular expressions, and others we could check it against a configuration or a data table.