/**
 * Check if a version is more than another
 * @param a left version
 * @param b right version
*/
export const moreThan = (a: string, b: string): boolean => {
    const aParts = a.split(".")
    const bParts = b.split(".")

    for (let i = 0; i < aParts.length; i++) {
        const aPart = parseInt(aParts[i])
        const bPart = parseInt(bParts[i])

        if (aPart > bPart) {
            return true
        } else if (aPart < bPart) {
            return false
        }
    }

    return false
}

/**
 * Check if a version is more than or equal to another
 * @param a left version
 * @param b right version
 * @returns
 */
export const moreThanOrEqual = (a: string, b: string): boolean => {
    return moreThan(a, b) || a === b
}

