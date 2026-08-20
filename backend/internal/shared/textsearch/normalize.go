package textsearch

import "strings"

var replacementPairs = []string{
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c",
}

var replacer = strings.NewReplacer(replacementPairs...)

var likeReplacer = strings.NewReplacer(
	`\`, `\\`,
	`%`, `\%`,
	`_`, `\_`,
)

// Normalize returns the canonical lowercase, Portuguese-accent-insensitive
// representation used by persisted search projections and request filters.
func Normalize(value string) string {
	return replacer.Replace(strings.ToLower(strings.TrimSpace(value)))
}

// EscapeLIKE makes a normalized user value safe for a LIKE expression that
// declares '\' as its ESCAPE character.
func EscapeLIKE(value string) string {
	return likeReplacer.Replace(value)
}

// SQLReplacementPairs returns the SQLite replacement sequence used to make
// persisted search projections equivalent to Normalize. SQLite's built-in
// LOWER only handles ASCII, so both lower- and upper-case accented forms are
// included explicitly.
func SQLReplacementPairs() [][2]string {
	replacements := make([][2]string, 0, len(replacementPairs))
	for i := 0; i < len(replacementPairs); i += 2 {
		from := replacementPairs[i]
		to := replacementPairs[i+1]
		replacements = append(replacements, [2]string{from, to})

		upper := strings.ToUpper(from)
		if upper != from {
			replacements = append(replacements, [2]string{upper, to})
		}
	}
	return replacements
}
