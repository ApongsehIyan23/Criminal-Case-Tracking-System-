// Sample reference data for the pilot. Names and article numbers still need
// verification against official sources before real use.
const organizationalUnits = [
  ['COM-YDE-C1', 'Commissariat Central No. 1, Yaoundé', 'COMMISSARIAT'],
  ['COM-YDE-C2', 'Commissariat Central No. 2, Yaoundé', 'COMMISSARIAT'],
  ['GEN-YDE-01', 'Brigade de Gendarmerie de Nlongkak', 'GENDARMERIE'],
  ['TPI-YDE-CA', 'Tribunal de Première Instance de Yaoundé Centre Administratif', 'COURT'],
  ['CHB-INSTR-01', "Examining Magistrate's Chamber No. 1", 'CHAMBER'],
];

const offenseCategories = [
  ['THEFT', 'Theft', 'Vol', 's. 318'],
  ['AGGRAVATED_THEFT', 'Aggravated theft', 'Vol aggravé', 's. 320'],
  ['FALSE_PRETENCES', 'Obtaining by false pretences', 'Escroquerie', 's. 318'],
  ['ASSAULT', 'Assault causing harm', 'Violences et blessures', 'ss. 277–281'],
  ['MURDER', 'Murder', 'Meurtre', 's. 275'],
  ['RAPE', 'Rape', 'Viol', 's. 296'],
  ['FORGERY', 'Forgery of documents', 'Faux en écriture', 's. 314'],
  ['CORRUPTION', 'Corruption', 'Corruption', 's. 134'],
  ['CYBERCRIME', 'Cybercrime', 'Cybercriminalité', 'Law No. 2010/012'],
];

module.exports = { organizationalUnits, offenseCategories };
