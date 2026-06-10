import { postCreateRoomName } from "@/api/mainActivity/Room.js"
import { useMitt } from "@/utils/mitt";
export function useCreateRoomName () {
  const mitt = useMitt();
  const createRoomName = async (options) => {
    const { messages, roomName, roomId } = options
    if(!["默认房间", "New Room", "新房间"].includes(roomName)) {
      return
    }
    const username = localStorage.getItem("username");
    const user = messages.find(item => item.sender === username)?.content
    const assistant = messages.find(item => item.sender !== username)?.content
    const content = JSON.stringify({user, assistant})
    try {
      const res = await postCreateRoomName({content})
      mitt.emit("renameRoom", {roomId, roomName: res.data.data.assistant} )
    } catch (error) {
      
    }
  }

  return {
    createRoomName
  }
}