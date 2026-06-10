import { apiGetCharacterDict } from "@/api/application/character"

export function useCharacterDirctory() {
  const getCharacterDirctory = async (key) => {
    const characterDict = JSON.parse(sessionStorage.getItem("characterDict") || '{}')
    if(characterDict?.hasOwnProperty(key)) {
      return characterDict[key]
    } else {
      try {
        const res = await apiGetCharacterDict()
        if(res?.data?.data) {
          sessionStorage.setItem("characterDict", JSON.stringify(res.data.data))
          return res.data[key] || []
        }
        return []
      } catch (error) {
        return []
      }
    }
  }
  return {
    getCharacterDirctory
  }
}