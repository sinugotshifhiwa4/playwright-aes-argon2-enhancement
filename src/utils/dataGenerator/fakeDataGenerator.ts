import { faker } from '@faker-js/faker';
import { SouthAfricaData } from './southAfricaData';

/**
 * Generate a fake South African phone number
 * e.g., "082 123 4567" or "+27 82 123 4567"
 *
 * @param includeCountryCode - Whether to prefix with +27
 * @returns A realistic SA mobile number string
 */
export function generateSouthAfricanPhoneNumber(includeCountryCode = false): string {
  const prefix = faker.helpers.arrayElement(SouthAfricaData.mobilePrefixes);
  const lineNumber = faker.string.numeric(7);

  if (includeCountryCode) {
    // Remove leading zero and format with spaces
    return `+27 ${prefix.slice(1)} ${lineNumber.slice(0, 3)} ${lineNumber.slice(3)}`;
  }

  return `${prefix} ${lineNumber.slice(0, 3)} ${lineNumber.slice(3)}`;
}

/**
 * Generate a fake South African-style street address
 * e.g., "127 Jan Smuts Avenue, Rosebank, Johannesburg, Gauteng, 2196"
 */
export function generateSouthAfricanAddress(): string {
  const streetNumber = faker.number.int({ min: 1, max: 9999 });
  const streetName = faker.helpers.arrayElement(SouthAfricaData.address.streets);
  const streetType = faker.helpers.arrayElement(SouthAfricaData.address.streetTypes);
  const suburb = faker.helpers.arrayElement(SouthAfricaData.address.suburbs);
  const city = faker.helpers.arrayElement(SouthAfricaData.address.cities);
  const province = faker.helpers.arrayElement(SouthAfricaData.address.provinces);

  // Safely fetch city-specific postal code
  const postalCodeFn = SouthAfricaData.address.postalCodeRanges[city as keyof typeof SouthAfricaData.address.postalCodeRanges]
    ?? SouthAfricaData.address.postalCodeRanges.default;
  const postalCode = postalCodeFn().toString().padStart(4, '0');

  const includeSuburb = faker.datatype.boolean(0.7); // 70% chance

  const addressParts = [
    `${streetNumber} ${streetName} ${streetType}`,
    includeSuburb && suburb !== city ? suburb : null,
    city,
    province,
    postalCode,
  ].filter(Boolean); // remove null if suburb was skipped

  return addressParts.join(', ');
}

/**
 * Generate a fake South African commercial/business address
 * Uses real areas, full list of provinces, and realistic formats
 */
export function generateSouthAfricanBusinessAddress(): string {
  const streetNumber = faker.number.int({ min: 1, max: 200 });
  const unitNumber = faker.number.int({ min: 1, max: 50 });
  const floorNumber = faker.number.int({ min: 1, max: 25 });
  const streetName = faker.helpers.arrayElement(SouthAfricaData.business.streets);
  const area = faker.helpers.arrayElement(SouthAfricaData.business.areas);
  const province = faker.helpers.arrayElement(SouthAfricaData.address.provinces);

  const postalCode = faker.number.int({ min: 1000, max: 9999 }).toString().padStart(4, '0');

  const formats = [
    `Unit ${unitNumber}, ${streetNumber} ${streetName} Street, ${area}, ${province}, ${postalCode}`,
    `${floorNumber}th Floor, ${streetNumber} ${streetName} Road, ${area}, ${province}, ${postalCode}`,
    `Suite ${unitNumber}, ${streetName} Centre, ${area}, ${province}, ${postalCode}`,
  ];

  return faker.helpers.arrayElement(formats) as string;
}
